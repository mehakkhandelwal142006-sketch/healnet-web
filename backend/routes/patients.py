from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional
from database import supabase
from auth import get_current_user, require_org   # <-- shared dependencies

router = APIRouter()


# ─────────────────────────────────────────────
# Schema
# ─────────────────────────────────────────────

class PatientCreate(BaseModel):
    patient_id:          str
    name:                str
    age:                 Optional[int]  = None
    gender:              Optional[str]  = None
    contact:             Optional[str]  = None
    blood_group:         Optional[str]  = None
    email:               Optional[str]  = None
    address:             Optional[str]  = None
    allergies:           Optional[str]  = None
    chronic_conditions:  Optional[str]  = None
    current_medications: Optional[str]  = None
    past_surgeries:      Optional[str]  = None
    family_history:      Optional[str]  = None
    medical_notes:       Optional[str]  = None
    emergency_name:      Optional[str]  = None
    emergency_relation:  Optional[str]  = None
    emergency_contact:   Optional[str]  = None
    model_config = {"extra": "ignore"}


# ─────────────────────────────────────────────
# Routes
# ─────────────────────────────────────────────

@router.get("/")
def get_all_patients(current_user: dict = Depends(get_current_user)):
    """
    ORG  → returns every patient in the system (the 'Recent Patients' dashboard view).
    SOLO → returns only the patients that this user registered themselves.
    """
    query = supabase.table("patients").select("*").order("created_at", desc=True)

    if current_user["kind"] == "solo":
        # Individual users see only their own records
        query = query.eq("registered_by", current_user["sub"])

    # Org users: no filter — they see all patients
    result = query.execute()
    return result.data


@router.get("/search/{query_str}")
def search_patients(query_str: str, current_user: dict = Depends(get_current_user)):
    """
    ORG  → searches across all patients.
    SOLO → searches only within the user's own patients.
    """
    query = (
        supabase.table("patients")
        .select("*")
        .ilike("name", f"%{query_str}%")
    )

    if current_user["kind"] == "solo":
        query = query.eq("registered_by", current_user["sub"])

    result = query.execute()
    return result.data


@router.get("/{patient_id}")
def get_patient(patient_id: str, current_user: dict = Depends(get_current_user)):
    """
    Returns a single patient record.
    SOLO users can only retrieve patients they registered themselves.
    ORG  users can retrieve any patient.
    """
    result = (
        supabase.table("patients")
        .select("*")
        .eq("patient_id", patient_id)
        .execute()
    )

    if not result.data:
        raise HTTPException(status_code=404, detail="Patient not found")

    patient = result.data[0]

    # Solo users cannot view someone else's record
    if current_user["kind"] == "solo" and patient.get("registered_by") != current_user["sub"]:
        raise HTTPException(
            status_code=403,
            detail="Access denied. You can only view your own health records.",
        )

    return patient


@router.post("/")
def create_patient(body: PatientCreate, current_user: dict = Depends(get_current_user)):
    """
    Creates a patient record.
    `registered_by` is always set to the calling user's ID — the frontend
    does not need to send this field.
    """
    existing = (
        supabase.table("patients")
        .select("patient_id")
        .eq("patient_id", body.patient_id)
        .execute()
    )
    if existing.data:
        raise HTTPException(status_code=400, detail="Patient ID already exists")

    data = body.model_dump()
    data["registered_by"] = current_user["sub"]   # always stamped server-side

    result = supabase.table("patients").insert(data).execute()
    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to create patient")

    return result.data[0]


@router.put("/{patient_id}")
def update_patient(
    patient_id: str,
    body: dict,
    current_user: dict = Depends(get_current_user),
):
    """
    Updates a patient record.
    SOLO users can only update their own patients.
    ORG  users can update any patient.
    """
    # Ownership check for solo users
    if current_user["kind"] == "solo":
        check = (
            supabase.table("patients")
            .select("registered_by")
            .eq("patient_id", patient_id)
            .execute()
        )
        if not check.data:
            raise HTTPException(status_code=404, detail="Patient not found")
        if check.data[0]["registered_by"] != current_user["sub"]:
            raise HTTPException(
                status_code=403,
                detail="Access denied. You can only edit your own health records.",
            )

    body.pop("patient_id", None)       # prevent ID tampering
    body.pop("registered_by", None)    # prevent ownership hijacking

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
def delete_patient(
    patient_id: str,
    current_user: dict = Depends(get_current_user),
):
    """
    Deletes a patient.
    SOLO users can only delete their own records.
    ORG  users can delete any patient.
    """
    if current_user["kind"] == "solo":
        check = (
            supabase.table("patients")
            .select("registered_by")
            .eq("patient_id", patient_id)
            .execute()
        )
        if not check.data:
            raise HTTPException(status_code=404, detail="Patient not found")
        if check.data[0]["registered_by"] != current_user["sub"]:
            raise HTTPException(
                status_code=403,
                detail="Access denied. You can only delete your own records.",
            )

    supabase.table("patients").delete().eq("patient_id", patient_id).execute()
    return {"message": f"Patient {patient_id} deleted successfully"}


# ─────────────────────────────────────────────
# Org-only: dashboard summary stats
# ─────────────────────────────────────────────

@router.get("/dashboard/summary")
def dashboard_summary(current_user: dict = Depends(require_org)):
    """
    Returns the 4 stat cards visible in the org dashboard
    (Total patients, Total alerts, Critical, Unacknowledged).
    Only accessible to organisation accounts.
    """
    patients_res = supabase.table("patients").select("patient_id", count="exact").execute()
    alerts_res   = supabase.table("alerts").select("id", count="exact").execute()
    critical_res = (
        supabase.table("alerts")
        .select("id", count="exact")
        .eq("level", "critical")
        .execute()
    )
    unack_res = (
        supabase.table("alerts")
        .select("id", count="exact")
        .eq("acknowledged", False)
        .execute()
    )

    return {
        "total_patients":   patients_res.count  or 0,
        "total_alerts":     alerts_res.count    or 0,
        "critical":         critical_res.count  or 0,
        "unacknowledged":   unack_res.count     or 0,
    }
