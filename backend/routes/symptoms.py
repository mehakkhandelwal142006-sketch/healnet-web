from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from database import supabase
from services.timeline_helper import log_event

router = APIRouter()


class SymptomCreate(BaseModel):
    patient_id: str
    symptom: str
    severity: Optional[str] = "mild"   # 'mild' | 'moderate' | 'severe'
    notes: Optional[str] = None

    model_config = {"extra": "ignore"}


@router.get("/{patient_id}")
def get_symptoms(patient_id: str, limit: int = 50):
    result = (
        supabase.table("symptoms_log")
        .select("*")
        .eq("patient_id", patient_id)
        .order("recorded_at", desc=True)
        .limit(limit)
        .execute()
    )
    return result.data


@router.post("/")
def record_symptom(body: SymptomCreate):
    pat = (
        supabase.table("patients")
        .select("patient_id")
        .eq("patient_id", body.patient_id)
        .execute()
    )
    if not pat.data:
        raise HTTPException(status_code=404, detail="Patient not found")

    result = supabase.table("symptoms_log").insert(body.model_dump()).execute()
    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to save symptom")

    row = result.data[0]

    severity_map = {"mild": "info", "moderate": "warning", "severe": "critical"}
    log_event(
        patient_id=body.patient_id,
        event_type="symptom",
        category="symptom",
        title=f"Symptom reported: {body.symptom}",
        description=body.notes,
        severity=severity_map.get(body.severity, "info"),
        value={"symptom": body.symptom, "severity": body.severity},
        source_table="symptoms_log",
        source_id=row.get("id"),
        occurred_at=row.get("recorded_at"),
    )

    return row
