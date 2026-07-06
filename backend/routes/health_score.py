"""
routes/health_score.py
─────────────────────────────────────────────────────────────────
GET /api/health-score/{patient_id}              → today's score + breakdown
GET /api/health-score/{patient_id}/history      → 30-day daily trend
GET /api/health-score/{patient_id}/explain      → this week vs last week insights
"""

from fastapi import APIRouter, HTTPException
from database import supabase
from services.health_score_engine import compute_health_score
from datetime import datetime, timedelta, timezone

router = APIRouter()


def _fetch_data(patient_id: str):
    pat = supabase.table("patients").select("patient_id").eq("patient_id", patient_id).execute()
    if not pat.data:
        raise HTTPException(status_code=404, detail="Patient not found")

    vitals = (
        supabase.table("vitals_readings")
        .select("*")
        .eq("patient_id", patient_id)
        .order("recorded_at", desc=True)
        .limit(30)
        .execute()
        .data
    )

    alerts = (
        supabase.table("alert_log")
        .select("*")
        .eq("patient_id", patient_id)
        .order("recorded_at", desc=True)
        .limit(100)
        .execute()
        .data
    )

    symptoms = []
    try:
        symptoms = (
            supabase.table("symptoms_log")
            .select("*")
            .eq("patient_id", patient_id)
            .order("recorded_at", desc=True)
            .limit(100)
            .execute()
            .data
        )
    except Exception:
        pass

    wearable_summary = None
    try:
        we = (
            supabase.table("health_events")
            .select("value")
            .eq("patient_id", patient_id)
            .eq("event_type", "report")
            .order("occurred_at", desc=True)
            .limit(1)
            .execute()
            .data
        )
        if we and we[0].get("value"):
            wearable_summary = we[0]["value"]
    except Exception:
        pass

    return vitals, alerts, symptoms, wearable_summary


@router.get("/{patient_id}")
def get_health_score(patient_id: str):
    vitals, alerts, symptoms, wearable = _fetch_data(patient_id)
    result = compute_health_score(vitals, alerts, symptoms, wearable)
    return {"patient_id": patient_id, **result}


@router.get("/{patient_id}/history")
def get_health_score_history(patient_id: str, days: int = 30):
    vitals_all, alerts_all, symptoms_all, _ = _fetch_data(patient_id)

    history = []
    today = datetime.now(timezone.utc).date()

    for i in range(days - 1, -1, -1):
        day = today - timedelta(days=i)
        day_end = datetime.combine(day, datetime.max.time()).replace(tzinfo=timezone.utc).isoformat()

        def up_to(records, field="recorded_at"):
            return [r for r in records if r.get(field, "") <= day_end]

        v = up_to(vitals_all)
        a = up_to(alerts_all)
        s = up_to(symptoms_all)

        if not v and not a:
            continue

        result = compute_health_score(v, a, s, None)
        history.append({
            "date": day.isoformat(),
            "total": result["total"],
            "grade": result["grade"],
            "categories": {c["label"]: c["score"] for c in result["categories"]},
        })

    return {"patient_id": patient_id, "days": days, "history": history}


# ════════════════════════════════════════════════════════════════════
#  EXPLAIN ENDPOINT — this week vs last week
# ════════════════════════════════════════════════════════════════════

def _avg(records: list, field: str):
    """Average of a numeric field across records, ignoring None."""
    vals = [r[field] for r in records if r.get(field) is not None]
    return round(sum(vals) / len(vals), 1) if vals else None


def _pct_change(old, new):
    if old is None or new is None or old == 0:
        return None
    return round(((new - old) / abs(old)) * 100, 1)


def _insight(label: str, old, new, unit: str = "",
             lower_is_better: bool = False, threshold: float = 2.0) -> dict | None:
    """
    Build one insight object if the change exceeds threshold.
    Returns None if no meaningful change or missing data.
    """
    if old is None or new is None:
        return None
    change = new - old
    pct = _pct_change(old, new)
    if abs(change) < threshold and (pct is None or abs(pct) < threshold):
        return None  # too small to mention

    # Direction from the patient's health perspective
    if lower_is_better:
        good = change < 0
    else:
        good = change > 0

    direction = "decreased" if change < 0 else "increased"
    status = "improved" if good else ("worsened" if abs(pct or change) > 10 else "watch")

    # Build plain-English sentence
    if unit == "%":
        magnitude = f"{abs(pct):.1f}%" if pct is not None else f"{abs(change):.1f}"
    elif unit == "bpm" or unit == "mmHg" or unit == "°C" or unit == "mg/dL":
        magnitude = f"{abs(change):.1f} {unit}"
    else:
        magnitude = f"{abs(pct):.1f}%" if pct is not None else f"{abs(change):.1f}"

    sentence = f"{label} {direction} by {magnitude} this week."
    if status == "improved":
        sentence += " ✅"
    elif status == "worsened":
        sentence += " ⚠️"

    return {
        "label": label,
        "status": status,       # "improved" | "worsened" | "watch" | "stable"
        "direction": "down" if change < 0 else "up",
        "change": round(change, 1),
        "pct_change": pct,
        "old_value": old,
        "new_value": new,
        "unit": unit,
        "sentence": sentence,
    }


@router.get("/{patient_id}/explain")
def explain_health(patient_id: str):
    """
    Compare this week (last 7 days) vs last week (days 8-14 ago).
    Returns a list of plain-English insights with direction and status.
    """
    now = datetime.now(timezone.utc)
    this_week_start = (now - timedelta(days=7)).isoformat()
    last_week_start = (now - timedelta(days=14)).isoformat()
    last_week_end   = (now - timedelta(days=7)).isoformat()

    pat = supabase.table("patients").select("patient_id,name").eq("patient_id", patient_id).execute()
    if not pat.data:
        raise HTTPException(status_code=404, detail="Patient not found")
    patient_name = pat.data[0].get("name", "Patient")

    # ── Fetch vitals for both windows ────────────────────────────
    def fetch_vitals(start, end=None):
        q = (supabase.table("vitals_readings").select("*")
             .eq("patient_id", patient_id)
             .gte("recorded_at", start))
        if end:
            q = q.lte("recorded_at", end)
        return q.execute().data

    this_vitals = fetch_vitals(this_week_start)
    last_vitals  = fetch_vitals(last_week_start, last_week_end)

    # ── Fetch alerts for both windows ────────────────────────────
    def fetch_alerts(start, end=None):
        q = (supabase.table("alert_log").select("*")
             .eq("patient_id", patient_id)
             .gte("recorded_at", start))
        if end:
            q = q.lte("recorded_at", end)
        return q.execute().data

    this_alerts = fetch_alerts(this_week_start)
    last_alerts  = fetch_alerts(last_week_start, last_week_end)

    # ── Fetch symptoms for both windows ──────────────────────────
    def fetch_symptoms(start, end=None):
        try:
            q = (supabase.table("symptoms_log").select("*")
                 .eq("patient_id", patient_id)
                 .gte("recorded_at", start))
            if end:
                q = q.lte("recorded_at", end)
            return q.execute().data
        except Exception:
            return []

    this_syms = fetch_symptoms(this_week_start)
    last_syms  = fetch_symptoms(last_week_start, last_week_end)

    # ── Health scores for both windows ───────────────────────────
    def fetch_all_vitals_up_to(cutoff):
        return (supabase.table("vitals_readings").select("*")
                .eq("patient_id", patient_id)
                .lte("recorded_at", cutoff)
                .order("recorded_at", desc=True)
                .limit(30)
                .execute().data)

    def fetch_all_alerts_up_to(cutoff):
        return (supabase.table("alert_log").select("*")
                .eq("patient_id", patient_id)
                .lte("recorded_at", cutoff)
                .order("recorded_at", desc=True)
                .limit(100)
                .execute().data)

    this_score_obj = compute_health_score(
        fetch_all_vitals_up_to(now.isoformat()),
        fetch_all_alerts_up_to(now.isoformat()),
        this_syms, None
    )
    last_score_obj = compute_health_score(
        fetch_all_vitals_up_to(last_week_end),
        fetch_all_alerts_up_to(last_week_end),
        last_syms, None
    )

    insights = []

    # ── Vital metric insights ─────────────────────────────────────
    metrics = [
        ("Resting HR",      "heart_rate",    "bpm",   False),
        ("SpO2",            "spo2",          "%",     True),   # lower is worse
        ("Systolic BP",     "systolic_bp",   "mmHg",  False),
        ("Temperature",     "temperature",   "°C",    False),
        ("Blood Sugar",     "blood_sugar",   "mg/dL", False),
    ]

    for label, field, unit, lower_is_better in metrics:
        old_avg = _avg(last_vitals, field)
        new_avg = _avg(this_vitals, field)
        ins = _insight(label, old_avg, new_avg, unit,
                       lower_is_better=lower_is_better, threshold=1.0)
        if ins:
            insights.append(ins)

    # ── Alert count insight ───────────────────────────────────────
    old_alerts = len(last_alerts)
    new_alerts  = len(this_alerts)
    if old_alerts != new_alerts:
        direction = "decreased" if new_alerts < old_alerts else "increased"
        good = new_alerts < old_alerts
        diff = abs(new_alerts - old_alerts)
        insights.append({
            "label": "Health Alerts",
            "status": "improved" if good else "worsened",
            "direction": "down" if new_alerts < old_alerts else "up",
            "change": new_alerts - old_alerts,
            "pct_change": _pct_change(old_alerts, new_alerts),
            "old_value": old_alerts,
            "new_value": new_alerts,
            "unit": "alerts",
            "sentence": f"Health alerts {direction} by {diff} this week. {'✅' if good else '⚠️'}",
        })

    # ── Symptom count insight ─────────────────────────────────────
    old_syms_count = len(last_syms)
    new_syms_count  = len(this_syms)
    if old_syms_count != new_syms_count:
        direction = "decreased" if new_syms_count < old_syms_count else "increased"
        good = new_syms_count < old_syms_count
        diff = abs(new_syms_count - old_syms_count)
        insights.append({
            "label": "Symptoms Reported",
            "status": "improved" if good else "worsened",
            "direction": "down" if new_syms_count < old_syms_count else "up",
            "change": new_syms_count - old_syms_count,
            "pct_change": _pct_change(old_syms_count, new_syms_count),
            "old_value": old_syms_count,
            "new_value": new_syms_count,
            "unit": "symptoms",
            "sentence": f"Symptoms reported {direction} by {diff} this week. {'✅' if good else '⚠️'}",
        })

    # ── Overall health score insight ──────────────────────────────
    old_score = last_score_obj["total"]
    new_score  = this_score_obj["total"]
    score_ins = _insight("Overall Health Score", old_score, new_score,
                         unit="%", lower_is_better=False, threshold=1.0)
    if score_ins:
        score_ins["sentence"] = (
            f"Overall health score {'improved' if new_score > old_score else 'dropped'} "
            f"from {old_score} to {new_score} this week. "
            f"{'✅' if new_score > old_score else '⚠️'}"
        )
        insights.append(score_ins)

    # ── Category score insights ───────────────────────────────────
    this_cats = {c["label"]: c["score"] for c in this_score_obj["categories"]}
    last_cats = {c["label"]: c["score"] for c in last_score_obj["categories"]}
    for cat_label, new_val in this_cats.items():
        old_val = last_cats.get(cat_label)
        ins = _insight(f"{cat_label} Score", old_val, new_val,
                       unit="pts", lower_is_better=False, threshold=1.0)
        if ins:
            insights.append(ins)

    # ── Summary line ──────────────────────────────────────────────
    improved = sum(1 for i in insights if i["status"] == "improved")
    worsened = sum(1 for i in insights if i["status"] == "worsened")

    if not insights:
        summary = f"Not enough data yet to compare this week vs last week for {patient_name}."
    elif improved > worsened:
        summary = f"{patient_name}'s health is trending positively — {improved} indicator(s) improved this week."
    elif worsened > improved:
        summary = f"{patient_name}'s health needs attention — {worsened} indicator(s) worsened this week."
    else:
        summary = f"{patient_name}'s health is stable — mixed signals this week."

    # Sort: worsened first, then watch, then improved
    order = {"worsened": 0, "watch": 1, "improved": 2, "stable": 3}
    insights.sort(key=lambda x: order.get(x["status"], 3))

    return {
        "patient_id": patient_id,
        "patient_name": patient_name,
        "period": "this_week_vs_last_week",
        "this_week_score": this_score_obj["total"],
        "last_week_score": old_score,
        "summary": summary,
        "insights": insights,
        "has_data": len(this_vitals) > 0 or len(this_alerts) > 0,
    }
