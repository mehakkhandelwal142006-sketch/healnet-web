"""
Shared helpers for the Health Timeline feature.

log_event()           -> inserts one row into health_events
compute_health_score() -> derives a simple 0-100 score from recent vitals + alerts
update_health_score()  -> recomputes score for a patient, logs a health_score event if it changed
"""

from database import supabase
from datetime import datetime, timezone


# ── Core event logger ──────────────────────────────────────────────
def log_event(
    patient_id: str,
    event_type: str,      # 'vital_change' | 'ai_alert' | 'medication' | 'symptom' | 'report' | 'health_score'
    category: str,        # e.g. 'heart_rate', 'medication', 'wearable'
    title: str,
    description: str = None,
    severity: str = None,         # 'info' | 'warning' | 'critical'
    value: dict = None,
    source_table: str = None,
    source_id: str = None,
    occurred_at: str = None,
):
    row = {
        "patient_id": patient_id,
        "event_type": event_type,
        "category": category,
        "title": title,
        "description": description,
        "severity": severity,
        "value": value,
        "source_table": source_table,
        "source_id": source_id,
        "occurred_at": occurred_at or datetime.now(timezone.utc).isoformat(),
    }
    try:
        supabase.table("health_events").insert(row).execute()
    except Exception as e:
        # Never let timeline logging break the primary feature (vitals/meds/etc.)
        print(f"[timeline] failed to log event for {patient_id}: {e}")


# ── Health score (simple, explainable, derived — not stored elsewhere) ──
def compute_health_score(patient_id: str) -> int:
    score = 100

    # Deduct for unacknowledged alerts in alert_log
    alerts = (
        supabase.table("alert_log")
        .select("category,acknowledged")
        .eq("patient_id", patient_id)
        .execute()
        .data
    )
    for a in alerts:
        if a.get("acknowledged"):
            continue
        if a.get("category") == "Critical":
            score -= 15
        elif a.get("category") == "Warning":
            score -= 5

    # Deduct for abnormal latest vital reading
    latest = (
        supabase.table("vitals_readings")
        .select("*")
        .eq("patient_id", patient_id)
        .order("recorded_at", desc=True)
        .limit(1)
        .execute()
        .data
    )
    if latest:
        v = latest[0]
        hr = v.get("heart_rate")
        spo2 = v.get("spo2")
        sbp = v.get("systolic_bp")
        if hr is not None and (hr > 120 or hr < 40):
            score -= 10
        if spo2 is not None and spo2 < 90:
            score -= 10
        if sbp is not None and (sbp > 180 or sbp < 80):
            score -= 10

    return max(0, min(100, score))


def update_health_score(patient_id: str):
    """Recompute score, and only log a timeline event if it actually changed
    since the last logged health_score event (avoids spamming the timeline)."""
    new_score = compute_health_score(patient_id)

    last = (
        supabase.table("health_events")
        .select("value")
        .eq("patient_id", patient_id)
        .eq("event_type", "health_score")
        .order("occurred_at", desc=True)
        .limit(1)
        .execute()
        .data
    )
    last_score = last[0]["value"].get("score") if last and last[0].get("value") else None

    if last_score == new_score:
        return  # no change, don't log

    delta = None if last_score is None else new_score - last_score
    log_event(
        patient_id=patient_id,
        event_type="health_score",
        category="health_score",
        title=f"Health score: {new_score}",
        description=(
            f"Score changed from {last_score} to {new_score}" if last_score is not None
            else f"Initial health score: {new_score}"
        ),
        severity="info",
        value={"score": new_score, "delta": delta},
        source_table="health_events",
    )
