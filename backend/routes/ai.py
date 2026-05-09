"""
routes/ai.py
FastAPI endpoint that runs HealNet AI on a patient's latest vitals.
"""
from fastapi import APIRouter, HTTPException
from database import supabase
from services.healnet_ai import HealNetAI, classify_vitals

router = APIRouter()


@router.get("/{patient_id}")
def get_ai_analysis(patient_id: str):
    """
    GET /api/ai/{patient_id}
    Returns full AI risk assessment for a patient.
    Uses their latest vitals + full alert history.
    """

    # 1. Check patient exists
    pat = supabase.table("patients").select("patient_id,name").eq("patient_id", patient_id).execute()
    if not pat.data:
        raise HTTPException(status_code=404, detail="Patient not found")

    # 2. Get latest vitals
    vitals_res = (
        supabase.table("vitals_readings")
        .select("*")
        .eq("patient_id", patient_id)
        .order("recorded_at", desc=True)
        .limit(1)
        .execute()
    )
    if not vitals_res.data:
        raise HTTPException(status_code=404, detail="No vitals recorded for this patient yet")

    latest_vitals = vitals_res.data[0]

    # 3. Get alert history (for trend detection)
    alerts_res = (
        supabase.table("alert_log")
        .select("*")
        .eq("patient_id", patient_id)
        .order("recorded_at", desc=True)
        .limit(20)
        .execute()
    )
    alert_log = alerts_res.data or []

    # 4. Convert raw vitals to classified vitals_map
    vitals_map = classify_vitals(latest_vitals)

    # 5. Run AI engine
    ai = HealNetAI(patient_id, vitals_map, alert_log)

    return ai.to_dict()


@router.post("/analyze")
def analyze_vitals(body: dict):
    """
    POST /api/ai/analyze
    Analyze any custom vitals dict directly (for quick testing).
    Body: { patient_id, heart_rate, spo2, systolic_bp, ... }
    """
    patient_id = body.get("patient_id", "unknown")
    vitals_map = classify_vitals(body)

    alerts_res = (
        supabase.table("alert_log")
        .select("*")
        .eq("patient_id", patient_id)
        .order("recorded_at", desc=True)
        .limit(20)
        .execute()
    )
    alert_log = alerts_res.data or []

    ai = HealNetAI(patient_id, vitals_map, alert_log)
    return ai.to_dict()
