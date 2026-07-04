"""
routes/health_score.py
─────────────────────────────────────────────────────────────────
GET /api/health-score/{patient_id}         → today's score + breakdown
GET /api/health-score/{patient_id}/history → 30-day daily trend
"""

from fastapi import APIRouter, HTTPException
from database import supabase
from services.health_score import compute_health_score
from datetime import datetime, timedelta, timezone

router = APIRouter()


def _fetch_data(patient_id: str):
    """Fetch all inputs needed for scoring from Supabase."""

    # Verify patient exists
    pat = supabase.table("patients").select("patient_id").eq("patient_id", patient_id).execute()
    if not pat.data:
        raise HTTPException(status_code=404, detail="Patient not found")

    # Vitals — last 30 readings, newest first
    vitals = (
        supabase.table("vitals_readings")
        .select("*")
        .eq("patient_id", patient_id)
        .order("recorded_at", desc=True)
        .limit(30)
        .execute()
        .data
    )

    # Alerts — all (acknowledged + unacknowledged)
    alerts = (
        supabase.table("alert_log")
        .select("*")
        .eq("patient_id", patient_id)
        .order("recorded_at", desc=True)
        .limit(100)
        .execute()
        .data
    )

    # Symptoms — all
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
        pass  # table may not exist yet on older deployments

    # Wearable summary from health_events value field (optional)
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
    """Return today's health score with full category breakdown."""
    vitals, alerts, symptoms, wearable = _fetch_data(patient_id)
    result = compute_health_score(vitals, alerts, symptoms, wearable)
    return {"patient_id": patient_id, **result}


@router.get("/{patient_id}/history")
def get_health_score_history(patient_id: str, days: int = 30):
    """
    Return a daily health score trend for the last N days.
    Each day uses only the vitals/alerts/symptoms recorded up to
    that day, so the trend reflects how the score evolved over time.
    """
    vitals_all, alerts_all, symptoms_all, _ = _fetch_data(patient_id)

    history = []
    today = datetime.now(timezone.utc).date()

    for i in range(days - 1, -1, -1):
        day = today - timedelta(days=i)
        day_end = datetime.combine(day, datetime.max.time()).replace(tzinfo=timezone.utc).isoformat()

        # Filter each dataset to only records up to end of this day
        def up_to(records, field="recorded_at"):
            return [r for r in records if r.get(field, "") <= day_end]

        v = up_to(vitals_all)
        a = up_to(alerts_all)
        s = up_to(symptoms_all)

        if not v and not a:
            # No data at all for this day — skip rather than show misleading flat line
            continue

        result = compute_health_score(v, a, s, None)
        history.append({
            "date": day.isoformat(),
            "total": result["total"],
            "grade": result["grade"],
            "categories": {c["label"]: c["score"] for c in result["categories"]},
        })

    return {"patient_id": patient_id, "days": days, "history": history}
