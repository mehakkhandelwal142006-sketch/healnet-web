"""
health_score.py
───────────────────────────────────────────────────────────────────
Rule-based daily health score engine for HealNet.

Score breakdown (max 100):
  Heart Health  25 pts  — HR, SpO2, BP ranges
  Recovery      20 pts  — active alerts + symptom severity
  Activity      20 pts  — steps/calories (partial if no wearable)
  Sleep         20 pts  — sleep hours (partial if no wearable)
  Stress        15 pts  — BP variability + symptom count + alert frequency

All sub-scores degrade gracefully: missing data → partial credit,
never zero. A patient with no wearable still gets a meaningful score
from vitals + alerts alone.
───────────────────────────────────────────────────────────────────
"""

from datetime import datetime, timedelta, timezone
from typing import Optional


# ── Internal helpers ──────────────────────────────────────────────
def _clamp(v: float, lo: float = 0.0, hi: float = 1.0) -> float:
    return max(lo, min(hi, v))


def _score_in_range(value: float, ideal_lo, ideal_hi, warn_lo, warn_hi) -> float:
    """Return 1.0 if in ideal range, 0.5 if in warning range, 0.0 if outside."""
    if ideal_lo <= value <= ideal_hi:
        return 1.0
    if warn_lo <= value <= warn_hi:
        return 0.5
    return 0.0


# ════════════════════════════════════════════════════════════════════
#  CATEGORY SCORERS
# ════════════════════════════════════════════════════════════════════

def score_heart_health(vitals_list: list) -> dict:
    """
    Max 25 pts.
    Uses the most recent vital reading with each metric.
    Missing metric → excluded from denominator (partial credit).
    """
    MAX = 25
    if not vitals_list:
        return {"score": round(MAX * 0.5), "max": MAX, "label": "Heart Health",
                "detail": "No vitals recorded — using baseline score.", "has_data": False}

    latest = vitals_list[0]  # already sorted desc by recorded_at

    checks = []

    hr = latest.get("heart_rate")
    if hr is not None:
        checks.append(_score_in_range(hr, 60, 100, 50, 110))

    spo2 = latest.get("spo2")
    if spo2 is not None:
        checks.append(_score_in_range(spo2, 95, 100, 90, 95))

    sbp = latest.get("systolic_bp")
    if sbp is not None:
        checks.append(_score_in_range(sbp, 90, 130, 80, 140))

    dbp = latest.get("diastolic_bp")
    if dbp is not None:
        checks.append(_score_in_range(dbp, 60, 85, 50, 90))

    if not checks:
        return {"score": round(MAX * 0.5), "max": MAX, "label": "Heart Health",
                "detail": "Vitals recorded but no heart metrics found.", "has_data": False}

    ratio = sum(checks) / len(checks)
    score = round(ratio * MAX)
    detail = f"HR: {hr or '—'} bpm · SpO2: {spo2 or '—'}% · BP: {f'{sbp}/{dbp}' if sbp else '—'} mmHg"
    return {"score": score, "max": MAX, "label": "Heart Health",
            "detail": detail, "has_data": True}


def score_recovery(alerts: list, symptoms: list) -> dict:
    """
    Max 20 pts.
    Penalises active (unacknowledged) alerts and recent symptoms.
    """
    MAX = 20
    score = MAX

    unacked_critical = sum(1 for a in alerts if not a.get("acknowledged") and a.get("category") == "Critical")
    unacked_warning  = sum(1 for a in alerts if not a.get("acknowledged") and a.get("category") == "Warning")
    score -= min(unacked_critical * 5, 15)
    score -= min(unacked_warning  * 2, 8)

    # Recent symptoms (last 7 days)
    cutoff = datetime.now(timezone.utc) - timedelta(days=7)
    recent_syms = []
    for s in symptoms:
        try:
            ts = datetime.fromisoformat(s.get("recorded_at", "").replace("Z", "+00:00"))
            if ts >= cutoff:
                recent_syms.append(s)
        except Exception:
            pass

    severe   = sum(1 for s in recent_syms if s.get("severity") == "severe")
    moderate = sum(1 for s in recent_syms if s.get("severity") == "moderate")
    score -= min(severe * 4, 10)
    score -= min(moderate * 2, 6)

    score = max(0, score)
    detail = f"{unacked_critical} critical · {unacked_warning} warning alerts · {len(recent_syms)} recent symptoms"
    return {"score": score, "max": MAX, "label": "Recovery",
            "detail": detail, "has_data": True}


def score_activity(wearable_summary: Optional[dict]) -> dict:
    """
    Max 20 pts.
    If no wearable data → 10 pts baseline (neutral, not penalised).
    """
    MAX = 20
    if not wearable_summary:
        return {"score": 10, "max": MAX, "label": "Activity",
                "detail": "No wearable data — connect a device for full scoring.",
                "has_data": False}

    steps    = wearable_summary.get("avg_steps")
    calories = wearable_summary.get("avg_calories")
    sub = []

    if steps is not None:
        # Target: 8000+ steps = full credit, <2000 = 0
        sub.append(_clamp((steps - 2000) / 6000))

    if calories is not None:
        # Target: 400+ kcal active = full, <100 = 0
        sub.append(_clamp((calories - 100) / 300))

    if not sub:
        return {"score": 10, "max": MAX, "label": "Activity",
                "detail": "Wearable connected but no step/calorie data.", "has_data": False}

    ratio = sum(sub) / len(sub)
    score = round(ratio * MAX)
    parts = []
    if steps is not None:    parts.append(f"{int(steps):,} avg steps")
    if calories is not None: parts.append(f"{int(calories)} avg kcal")
    return {"score": score, "max": MAX, "label": "Activity",
            "detail": " · ".join(parts), "has_data": True}


def score_sleep(wearable_summary: Optional[dict]) -> dict:
    """
    Max 20 pts.
    If no wearable data → 10 pts baseline.
    """
    MAX = 20
    if not wearable_summary:
        return {"score": 10, "max": MAX, "label": "Sleep",
                "detail": "No wearable data — connect a device for full scoring.",
                "has_data": False}

    sleep_hrs = wearable_summary.get("avg_sleep")
    if sleep_hrs is None:
        return {"score": 10, "max": MAX, "label": "Sleep",
                "detail": "Wearable connected but no sleep data.", "has_data": False}

    # Ideal: 7–9 hrs. Penalty for <6 or >10.
    if 7 <= sleep_hrs <= 9:
        ratio = 1.0
    elif 6 <= sleep_hrs < 7 or 9 < sleep_hrs <= 10:
        ratio = 0.7
    elif 5 <= sleep_hrs < 6 or 10 < sleep_hrs <= 11:
        ratio = 0.4
    else:
        ratio = 0.1

    score = round(ratio * MAX)
    return {"score": score, "max": MAX, "label": "Sleep",
            "detail": f"Avg {sleep_hrs:.1f} hrs/night", "has_data": True}


def score_stress(vitals_list: list, symptoms: list, alerts: list) -> dict:
    """
    Max 15 pts.
    Derived from: BP variability across readings, symptom burden, alert frequency.
    """
    MAX = 15
    score = MAX

    # BP variability: high variance in systolic_bp → stress signal
    sbp_readings = [v["systolic_bp"] for v in vitals_list if v.get("systolic_bp") is not None]
    if len(sbp_readings) >= 3:
        avg = sum(sbp_readings) / len(sbp_readings)
        variance = sum((x - avg) ** 2 for x in sbp_readings) / len(sbp_readings)
        std = variance ** 0.5
        if std > 20:
            score -= 5
        elif std > 10:
            score -= 3

    # Symptom burden (all time, not just recent — cumulative indicator)
    sym_count = len(symptoms)
    score -= min(sym_count // 3, 5)

    # Alert frequency in last 7 days
    cutoff = datetime.now(timezone.utc) - timedelta(days=7)
    recent_alerts = 0
    for a in alerts:
        try:
            ts = datetime.fromisoformat(a.get("recorded_at", "").replace("Z", "+00:00"))
            if ts >= cutoff:
                recent_alerts += 1
        except Exception:
            pass
    score -= min(recent_alerts // 2, 5)

    score = max(0, score)
    bp_var_str = f"BP std dev: {(variance**0.5):.1f}" if len(sbp_readings) >= 3 else "BP variability: insufficient data"
    return {"score": score, "max": MAX, "label": "Stress",
            "detail": f"{bp_var_str} · {sym_count} total symptoms · {recent_alerts} alerts/7d",
            "has_data": True}


# ════════════════════════════════════════════════════════════════════
#  MAIN ENTRY POINT
# ════════════════════════════════════════════════════════════════════

def compute_health_score(
    vitals_list: list,
    alerts: list,
    symptoms: list,
    wearable_summary: Optional[dict] = None,
) -> dict:
    """
    Returns a complete health score payload:
    {
        total: int (0-100),
        grade: str,
        categories: [ { label, score, max, detail, has_data }, ... ],
        computed_at: str (ISO),
    }
    """
    heart    = score_heart_health(vitals_list)
    recovery = score_recovery(alerts, symptoms)
    activity = score_activity(wearable_summary)
    sleep    = score_sleep(wearable_summary)
    stress   = score_stress(vitals_list, symptoms, alerts)

    categories = [heart, recovery, activity, sleep, stress]
    total = sum(c["score"] for c in categories)

    if total >= 85:
        grade = "Excellent"
    elif total >= 70:
        grade = "Good"
    elif total >= 55:
        grade = "Fair"
    elif total >= 40:
        grade = "Poor"
    else:
        grade = "Critical"

    return {
        "total": total,
        "max": 100,
        "grade": grade,
        "categories": categories,
        "computed_at": datetime.now(timezone.utc).isoformat(),
        "wearable_connected": wearable_summary is not None,
    }
