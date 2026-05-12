from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from database import supabase

router = APIRouter()


class PatientCreate(BaseModel):
    patient_id:          str
    name:                str
    age:                 Optional[int] = None
    gender:              Optional[str] = None
    contact:             Optional[str] = None
    blood_group:         Optional[str] = None
    email:               Optional[str] = None
    address:             Optional[str] = None
    registered_by:       Optional[str] = None
    allergies:           Optional[str] = None
    chronic_conditions:  Optional[str] = None
    current_medications: Optional[str] = None
    past_surgeries:      Optional[str] = None
    family_history:      Optional[str] = None
    medical_notes:       Optional[str] = None
    emergency_name:      Optional[str] = None
    emergency_relation:  Optional[str] = None
    emergency_contact:   Optional[str] = None

    model_config = {"extra": "ignore"}


@router.get("/")
def get_all_patients():
    result = (
        supabase.table("patients")
        .select("*")
        .order("created_at", desc=True)
        .execute()
    )
    return result.data


@router.get("/search/{query}")
def search_patients(query: str):
    result = (
        supabase.table("patients")
        .select("*")
        .ilike("name", f"%{query}%")
        .execute()
    )
    return result.data


@router.get("/{patient_id}")
def get_patient(patient_id: str):
    result = (
        supabase.table("patients")
        .select("*")
        .eq("patient_id", patient_id)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Patient not found")
    return result.data[0]


@router.post("/")
def create_patient(body: PatientCreate):
    existing = (
        supabase.table("patients")
        .select("patient_id")
        .eq("patient_id", body.patient_id)
        .execute()
    )
    if existing.data:
        raise HTTPException(status_code=400, detail="Patient ID already exists")

    result = supabase.table("patients").insert(body.model_dump()).execute()
    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to create patient")
    return result.data[0]


@router.put("/{patient_id}")
def update_patient(patient_id: str, body: dict):
    body.pop("patient_id", None)
    result = (
        supabase.table("patients")
        .update(body)
        .eq("patient_id", patient_id)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Patient not found")
    return result.data[0]


@router.delete("/{patient_id}")
def delete_patient(patient_id: str):
    supabase.table("patients").delete().eq("patient_id", patient_id).execute()
    return {"message": f"Patient {patient_id} deleted successfully"}
