from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from database import supabase
from services.timeline_helper import log_event

router = APIRouter()


class MedicationCreate(BaseModel):
    patient_id: str
    medication_name: str
    dosage: Optional[str] = None
    notes: Optional[str] = None

    model_config = {"extra": "ignore"}


@router.get("/{patient_id}")
def get_medications(patient_id: str, limit: int = 50):
    result = (
        supabase.table("medication_log")
        .select("*")
        .eq("patient_id", patient_id)
        .order("recorded_at", desc=True)
        .limit(limit)
        .execute()
    )
    return result.data


@router.post("/")
def record_medication(body: MedicationCreate):
    pat = (
        supabase.table("patients")
        .select("patient_id")
        .eq("patient_id", body.patient_id)
        .execute()
    )
    if not pat.data:
        raise HTTPException(status_code=404, detail="Patient not found")

    result = supabase.table("medication_log").insert(body.model_dump()).execute()
    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to save medication")

    row = result.data[0]

    desc_parts = []
    if body.dosage:
        desc_parts.append(body.dosage)
    if body.notes:
        desc_parts.append(body.notes)

    log_event(
        patient_id=body.patient_id,
        event_type="medication",
        category="medication",
        title=f"Medication logged: {body.medication_name}",
        description=" · ".join(desc_parts) if desc_parts else None,
        severity="info",
        value={"medication_name": body.medication_name, "dosage": body.dosage},
        source_table="medication_log",
        source_id=row.get("id"),
        occurred_at=row.get("recorded_at"),
    )

    return row
