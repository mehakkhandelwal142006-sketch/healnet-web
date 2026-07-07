"""
services/smart_alerts.py
─────────────────────────────────────────────────────────────────
Smart Health Alerts — gradual deterioration detection.

Detects, per patient, whether any of these 4 metrics have been
trending in the "worse" direction for 3+ consecutive data points:

  - Resting Heart Rate   (rising  = worse)  — from vitals_readings
  - Stress Level         (rising  = worse)  — derived: BP deviation
                                               + symptoms + alerts
  - Sleep Duration       (falling = worse)  — from wearable_daily
  - Activity (steps)     (falling = worse)  — from wearable_daily

All computation happens locally on data already in Supabase —
no external calls, no ML model. This mirrors the same rule-based
philosophy as health_score_engine.py.
─────────────────────────────────────────────────────────────────
"""

from datetime import datetime, timedelta, timezone
from typing import Optional
from database import supabase

LOOKBACK_DAYS = 14           # how much history to pull
MIN_STREAK    = 3            # consecutive worsening days to trigger an alert
MIN_POINTS    = 4            # need at least streak+1 points to have a baseline


# ════════════════════════════════════════════════════════════════════
#  DATA FETCHERS — build day -> value series from existing tables
# ════════════════════════════════════════════════════════════════════

def _cutoff_iso(days: int) -> str:
    return (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()


def _date_str(ts: str) -> Optional[str]:
    if not ts:
        return None
    try:
        return datetime.fromisoformat(ts.replace("Z", "+00:00")).date().isoformat()
    except Exception:
        return None


def _daily_avg_from_vitals(patient_id: str, field: str, days: int = LOOKBACK_DAYS) -> dict:
    """Returns {date_str: avg_value} for a numeric field in vitals_readings."""
    rows = (
        supabase.table("vitals_readings")
        .select("recorded_at," + field)
        .eq("patient_id", patient_id)
        .gte("recorded_at", _cutoff_iso(days))
        .execute()
        .data
    )
    buckets: dict[str, list] = {}
    for r in rows:
        d = _date_str(r.get("recorded_at"))
        v = r.get(field)
        if d and v is not None:
            buckets.setdefault(d, []).append(v)
    return {d: round(sum(v) / len(v), 1) for d, v in buckets.items()}


def _daily_wearable(patient_id: str, field: str, days: int = LOOKBACK_DAYS) -> dict:
    """Returns {date_str: value} from wearable_daily (already one row/day)."""
    try:
        rows = (
            supabase.table("wearable_daily")
            .select(f"date,{field}")
            .eq("patient_id", patient_id)
            .gte("date", (datetime.now(timezone.utc) - timedelta(days=days)).date().isoformat())
            .order("date")
            .execute()
            .data
        )
    except Exception:
        return {}
    out = {}
    for r in rows:
        v = r.get(field)
        d = r.get("date")
        if d and v is not None:
            out[d] = v
    return out


def _daily_symptom_alert_counts(patient_id: str, days: int = LOOKBACK_DAYS) -> dict:
    """Returns {date_str: {'symptoms': n, 'alerts': n}}."""
    counts: dict[str, dict] = {}

    syms = []
    try:
        syms = (
            supabase.table("symptoms_log")
            .select("recorded_at")
            .eq("patient_id", patient_id)
            .gte("recorded_at", _cutoff_iso(days))
            .execute()
            .data
        )
    except Exception:
        pass

    alerts = (
        supabase.table("alert_log")
        .select("recorded_at")
        .eq("patient_id", patient_id)
        .gte("recorded_at", _cutoff_iso(days))
        .execute()
        .data
    )

    for s in syms:
        d = _date_str(s.get("recorded_at"))
        if d:
            counts.setdefault(d, {"symptoms": 0, "alerts": 0})["symptoms"] += 1
    for a in alerts:
        d = _date_str(a.get("recorded_at"))
        if d:
            counts.setdefault(d, {"symptoms": 0, "alerts": 0})["alerts"] += 1

    return counts


def _daily_stress_series(patient_id: str, days: int = LOOKBACK_DAYS) -> dict:
    """
    Derived daily stress score (higher = more stressed).
    Based on: deviation of that day's avg systolic BP from the
    patient's own baseline avg, plus symptom/alert load that day.
    """
    sbp_by_day = _daily_avg_from_vitals(patient_id, "systolic_bp", days)
    if not sbp_by_day:
        baseline_sbp = None
    else:
        baseline_sbp = sum(sbp_by_day.values()) / len(sbp_by_day)

    load_by_day = _daily_symptom_alert_counts(patient_id, days)

    all_days = set(sbp_by_day) | set(load_by_day)
    series = {}
    for d in all_days:
        score = 0.0
        if baseline_sbp is not None and d in sbp_by_day:
            score += max(0.0, sbp_by_day[d] - baseline_sbp) * 0.5
        load = load_by_day.get(d, {"symptoms": 0, "alerts": 0})
        score += load["symptoms"] * 3 + load["alerts"] * 4
        series[d] = round(score, 1)
    return series


# ════════════════════════════════════════════════════════════════════
#  TREND DETECTOR
# ════════════════════════════════════════════════════════════════════

def _detect_streak(series: dict, worse_direction: str, min_delta: float):
    """
    series: {date_str: value}
    worse_direction: 'up' (rising is bad) or 'down' (falling is bad)

    Returns None if no meaningful worsening streak, otherwise a dict
    describing the streak: length, baseline_value, current_value, change.
    """
    if len(series) < MIN_POINTS:
        return None

    dates = sorted(series.keys())
    values = [series[d] for d in dates]

    # Walk backwards from the most recent point, counting how many
    # consecutive steps moved in the "worse" direction by at least min_delta.
    streak = 1
    i = len(values) - 1
    while i > 0:
        diff = values[i] - values[i - 1]
        moved_worse = diff >= min_delta if worse_direction == "up" else diff <= -min_delta
        if moved_worse:
            streak += 1
            i -= 1
        else:
            break

    if streak < MIN_STREAK:
        return None

    streak_start_idx = len(values) - streak
    baseline_slice = values[:streak_start_idx] if streak_start_idx > 0 else values[:1]
    if not baseline_slice:
        return None

    baseline_value = round(sum(baseline_slice) / len(baseline_slice), 1)
    recent_slice = values[streak_start_idx:]
    current_value = round(sum(recent_slice) / len(recent_slice), 1)
    change = round(current_value - baseline_value, 1)

    return {
        "streak_days": streak,
        "baseline_value": baseline_value,
        "current_value": current_value,
        "change": change,
        "from_date": dates[streak_start_idx],
        "to_date": dates[-1],
    }


def _severity(streak_days: int) -> str:
    if streak_days >= 6:
        return "high"
    if streak_days >= 4:
        return "moderate"
    return "mild"


# ════════════════════════════════════════════════════════════════════
#  METRIC DEFINITIONS
# ════════════════════════════════════════════════════════════════════

METRICS = [
    {
        "key": "resting_hr",
        "label": "Resting Heart Rate",
        "unit": "bpm",
        "worse_direction": "up",
        "min_delta": 1.0,
        "fetch": lambda pid: _daily_avg_from_vitals(pid, "heart_rate"),
    },
    {
        "key": "stress",
        "label": "Stress Level",
        "unit": "pts",
        "worse_direction": "up",
        "min_delta": 1.0,
        "fetch": lambda pid: _daily_stress_series(pid),
    },
    {
        "key": "sleep",
        "label": "Sleep Duration",
        "unit": "hrs",
        "worse_direction": "down",
        "min_delta": 0.2,
        "fetch": lambda pid: _daily_wearable(pid, "avg_sleep_hours"),
    },
    {
        "key": "activity",
        "label": "Activity (Steps)",
        "unit": "steps",
        "worse_direction": "down",
        "min_delta": 200,
        "fetch": lambda pid: _daily_wearable(pid, "avg_steps"),
    },
]


def _message(label: str, unit: str, direction: str, streak: dict) -> str:
    verb = "risen" if direction == "up" else "declined"
    change_abs = abs(streak["change"])
    return (
        f"{label} has {verb} for {streak['streak_days']} consecutive days "
        f"({streak['baseline_value']} → {streak['current_value']} {unit}, "
        f"a change of {change_abs} {unit})."
    )


def get_smart_alerts(patient_id: str) -> dict:
    """
    Main entry point. Returns:
    {
        patient_id: str,
        checked_at: iso str,
        has_data: bool,
        alerts: [ { metric, label, severity, streak_days, unit,
                     baseline_value, current_value, change,
                     direction, message, from_date, to_date }, ... ]
    }
    """
    alerts = []
    any_data = False

    for m in METRICS:
        series = m["fetch"](patient_id)
        if series:
            any_data = True
        streak = _detect_streak(series, m["worse_direction"], m["min_delta"])
        if streak:
            alerts.append({
                "metric": m["key"],
                "label": m["label"],
                "unit": m["unit"],
                "direction": m["worse_direction"],
                "severity": _severity(streak["streak_days"]),
                "streak_days": streak["streak_days"],
                "baseline_value": streak["baseline_value"],
                "current_value": streak["current_value"],
                "change": streak["change"],
                "from_date": streak["from_date"],
                "to_date": streak["to_date"],
                "message": _message(m["label"], m["unit"], m["worse_direction"], streak),
            })

    # Worst severity first
    order = {"high": 0, "moderate": 1, "mild": 2}
    alerts.sort(key=lambda a: order.get(a["severity"], 3))

    return {
        "patient_id": patient_id,
        "checked_at": datetime.now(timezone.utc).isoformat(),
        "has_data": any_data,
        "alerts": alerts,
    }
