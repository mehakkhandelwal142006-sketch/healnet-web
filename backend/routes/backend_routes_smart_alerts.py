"""
routes/smart_alerts.py
─────────────────────────────────────────────────────────────────
GET /api/smart-alerts/{patient_id}  → gradual deterioration alerts
"""

from fastapi import APIRouter, HTTPException
from database import supabase
from services.smart_alerts import get_smart_alerts

router = APIRouter()


@router.get("/{patient_id}")
def smart_alerts_for_patient(patient_id: str):
    pat = supabase.table("patients").select("patient_id").eq("patient_id", patient_id).execute()
    if not pat.data:
        raise HTTPException(status_code=404, detail="Patient not found")

    return get_smart_alerts(patient_id)
