from fastapi import APIRouter, HTTPException, Header
from pydantic import BaseModel
from typing import Optional
from database import supabase
import jwt
import os

router = APIRouter()

JWT_SECRET = os.getenv("JWT_SECRET", "healnet-secret-key")
@router.get("/")
def get_all_patients(authorization: Optional[str] = Header(None)):
    user_id = get_user_id(authorization)
    print(f"DEBUG user_id: {user_id}")  # ← add this
    print(f"DEBUG auth header: {authorization[:50] if authorization else None}")
    query = supabase.table("patients").select("*").order("created_at", desc=True)
    if user_id:
        query = query.eq("created_by", user_id)
    result = query.execute()
    return result.data
def get_user_id(authorization: Optional[str]) -> Optional[str]:
    if not authorization:
        return None
    try:
        token = authorization.replace("Bearer ", "")
        # Try decoding without verification first to see payload
        payload = jwt.decode(token, options={"verify_signature": False})
        print(f"DEBUG payload: {payload}")
        # Now try with secret
        payload = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
        return payload.get("user_id") or payload.get("sub") or payload.get("id")
    except Exception as e:
        print(f"DEBUG JWT error: {e}")  # ← this will show exact error
        return None
# ── Helper: get user_id from token ───────────────────────────────
def get_user_id(authorization: Optional[str]) -> Optional[str]:
    if not authorization:
        return None
    try:
        token = authorization.replace("Bearer ", "")
        payload = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
        return payload.get("user_id") or payload.get("sub") or payload.get("id")
    except Exception:
        return None

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

# ── GET ALL — only patients added by logged-in user ───────────────
@router.get("/")
def get_all_patients(authorization: Optional[str] = Header(None)):
    user_id = get_user_id(authorization)
    query = supabase.table("patients").select("*").order("created_at", desc=True)
    if user_id:
        query = query.eq("created_by", user_id)
    result = query.execute()
    return result.data

# ── SEARCH — only within logged-in user's patients ────────────────
@router.get("/search/{query}")
def search_patients(query: str, authorization: Optional[str] = Header(None)):
    user_id = get_user_id(authorization)
    q = supabase.table("patients").select("*").ilike("name", f"%{query}%")
    if user_id:
        q = q.eq("created_by", user_id)
    result = q.execute()
    return result.data

# ── GET ONE — only if it belongs to logged-in user ────────────────
@router.get("/{patient_id}")
def get_patient(patient_id: str, authorization: Optional[str] = Header(None)):
    user_id = get_user_id(authorization)
    q = supabase.table("patients").select("*").eq("patient_id", patient_id)
    if user_id:
        q = q.eq("created_by", user_id)
    result = q.execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Patient not found")
    return result.data[0]

# ── CREATE — save created_by = logged-in user ─────────────────────
@router.post("/")
def create_patient(body: PatientCreate, authorization: Optional[str] = Header(None)):
    user_id = get_user_id(authorization)
    existing = (
        supabase.table("patients")
        .select("patient_id")
        .eq("patient_id", body.patient_id)
        .execute()
    )
    if existing.data:
        raise HTTPException(status_code=400, detail="Patient ID already exists")
    data = body.model_dump()
    if user_id:
        data["created_by"] = user_id
    result = supabase.table("patients").insert(data).execute()
    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to create patient")
    return result.data[0]

# ── UPDATE — only if belongs to logged-in user ────────────────────
@router.put("/{patient_id}")
def update_patient(patient_id: str, body: dict, authorization: Optional[str] = Header(None)):
    user_id = get_user_id(authorization)
    body.pop("patient_id", None)
    q = supabase.table("patients").update(body).eq("patient_id", patient_id)
    if user_id:
        q = q.eq("created_by", user_id)
    result = q.execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Patient not found")
    return result.data[0]

# ── DELETE — only if belongs to logged-in user ────────────────────
@router.delete("/{patient_id}")
def delete_patient(patient_id: str, authorization: Optional[str] = Header(None)):
    user_id = get_user_id(authorization)
    q = supabase.table("patients").delete().eq("patient_id", patient_id)
    if user_id:
        q = q.eq("created_by", user_id)
    q.execute()
    return {"message": f"Patient {patient_id} deleted successfully"}
