from fastapi import APIRouter, HTTPException
from database import supabase
from datetime import datetime

router = APIRouter()


# ── GET ALL ALERTS ────────────────────────────────────────────────
@router.get("/")
def get_alerts(limit: int = 50, unacknowledged_only: bool = False):
    query = (
        supabase.table("alert_log")
        .select("*")
        .order("recorded_at", desc=True)
        .limit(limit)
    )
    if unacknowledged_only:
        query = query.eq("acknowledged", False)
    return query.execute().data


# ── GET ALERTS FOR A PATIENT ──────────────────────────────────────
@router.get("/{patient_id}")
def get_patient_alerts(patient_id: str):
    result = (
        supabase.table("alert_log")
        .select("*")
        .eq("patient_id", patient_id)
        .order("recorded_at", desc=True)
        .execute()
    )
    return result.data


# ── ACKNOWLEDGE AN ALERT ──────────────────────────────────────────
@router.patch("/{alert_id}/acknowledge")
def acknowledge_alert(alert_id: str, ack_by: str = "staff"):
    result = supabase.table("alert_log").update({
        "acknowledged": True,
        "ack_by":       ack_by,
        "ack_time":     datetime.utcnow().isoformat()
    }).eq("id", alert_id).execute()

    if not result.data:
        raise HTTPException(status_code=404, detail="Alert not found")
    return result.data[0]


# ── ALERT STATS SUMMARY ───────────────────────────────────────────
@router.get("/stats/summary")
def alert_stats():
    all_alerts = (
        supabase.table("alert_log")
        .select("category,acknowledged")
        .execute()
        .data
    )
    total    = len(all_alerts)
    critical = sum(1 for a in all_alerts if a["category"] == "Critical")
    warnings = sum(1 for a in all_alerts if a["category"] == "Warning")
    unacked  = sum(1 for a in all_alerts if not a["acknowledged"])

    return {
        "total":           total,
        "critical":        critical,
        "warnings":        warnings,
        "unacknowledged":  unacked
    }
