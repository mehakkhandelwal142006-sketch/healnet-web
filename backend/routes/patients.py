from fastapi import APIRouter, HTTPException, Header
from pydantic import BaseModel
from typing import Optional
from database import supabase
import jwt
import os

router = APIRouter()

JWT_SECRET = os.getenv("JWT_SECRET", "healnet-secret-key")


class AuthUser:
    """Resolved identity from a Bearer token."""
    def __init__(self, user_id: str, kind: str):
        self.user_id = user_id
        self.kind = kind

    @property
    def is_org(self) -> bool:
        return self.kind == "org"


# ── Helper: get user identity from token (fails CLOSED, not open) ─
def get_auth_user(authorization: Optional[str]) -> AuthUser:
    """
    Returns the (user_id, kind) from a valid Bearer token.
    Raises 401 if the header is missing, malformed, or the token
    is invalid/expired — instead of silently returning None.
    """
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or malformed Authorization header")
    token = authorization.replace("Bearer ", "")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")
    user_id = payload.get("user_id") or payload.get("sub") or payload.get("id")
    if not user_id:
        raise HTTPException(status_code=401, detail="Token missing user identity")
    kind = payload.get("kind", "solo")
    return AuthUser(user_id=user_id, kind=kind)


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


# ── GET ALL ─────────────────────────────────────────────────────
# Every account only ever sees patients they created - no exceptions
# for any account type (solo/staff/org).
@router.get("/")
def get_all_patients(authorization: Optional[str] = Header(None)):
    auth = get_auth_user(authorization)
    query = (
        supabase.table("patients").select("*")
        .eq("created_by", auth.user_id)
        .order("created_at", desc=True)
    )
    result = query.execute()
    return result.data


# ── SEARCH ──────────────────────────────────────────────────────
@router.get("/search/{query}")
def search_patients(query: str, authorization: Optional[str] = Header(None)):
    auth = get_auth_user(authorization)
    q = (
        supabase.table("patients").select("*")
        .ilike("name", f"%{query}%")
        .eq("created_by", auth.user_id)
    )
    result = q.execute()
    return result.data


# ── GET ONE ─────────────────────────────────────────────────────
@router.get("/{patient_id}")
def get_patient(patient_id: str, authorization: Optional[str] = Header(None)):
    auth = get_auth_user(authorization)
    q = (
        supabase.table("patients").select("*")
        .eq("patient_id", patient_id)
        .eq("created_by", auth.user_id)
    )
    result = q.execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Patient not found")
    return result.data[0]


# ── CREATE — always stamped with the creator's own user_id ───────
@router.post("/")
def create_patient(body: PatientCreate, authorization: Optional[str] = Header(None)):
    auth = get_auth_user(authorization)
    existing = (
        supabase.table("patients")
        .select("patient_id")
        .eq("patient_id", body.patient_id)
        .execute()
    )
    if existing.data:
        raise HTTPException(status_code=400, detail="Patient ID already exists")
    data = body.model_dump()
    data["created_by"] = auth.user_id
    result = supabase.table("patients").insert(data).execute()
    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to create patient")
    return result.data[0]


# ── UPDATE ──────────────────────────────────────────────────────
# Every account can only update patients they created.
@router.put("/{patient_id}")
def update_patient(patient_id: str, body: dict, authorization: Optional[str] = Header(None)):
    auth = get_auth_user(authorization)
    body.pop("patient_id", None)
    q = (
        supabase.table("patients").update(body)
        .eq("patient_id", patient_id)
        .eq("created_by", auth.user_id)
    )
    result = q.execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Patient not found")
    return result.data[0]


# ── DELETE ──────────────────────────────────────────────────────
# Every account can only delete patients they created.
@router.delete("/{patient_id}")
def delete_patient(patient_id: str, authorization: Optional[str] = Header(None)):
    auth = get_auth_user(authorization)
    q = (
        supabase.table("patients").delete()
        .eq("patient_id", patient_id)
        .eq("created_by", auth.user_id)
    )
    result = q.execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Patient not found")
    return {"message": f"Patient {patient_id} deleted successfully"}