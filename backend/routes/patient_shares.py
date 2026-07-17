"""
routes/patient_shares.py
─────────────────────────────────────────────────────────────────
QR-based patient sharing (full access - a linked family member can
view AND add data for the shared patient, same as the owner).

POST   /api/patient-shares/{patient_id}    -> generate a share token (owner only)
POST   /api/patient-shares/redeem          -> redeem a token (any logged-in user)
GET    /api/patient-shares/shared-with-me  -> list patients shared with me
DELETE /api/patient-shares/{share_id}      -> revoke a share (owner only)
"""
import secrets
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, HTTPException, Header
from pydantic import BaseModel
from typing import Optional
from database import supabase
import jwt
import os

router = APIRouter()

JWT_SECRET = os.getenv("JWT_SECRET", "healnet-secret-key")
SHARE_TOKEN_TTL_HOURS = 24  # a generated QR code must be scanned within this window


class AuthUser:
    def __init__(self, user_id: str, kind: str):
        self.user_id = user_id
        self.kind = kind


def get_auth_user(authorization: Optional[str]) -> AuthUser:
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


class RedeemBody(BaseModel):
    token: str


# ── GENERATE a share token/QR for a patient (owner only) ───────────
@router.post("/{patient_id}")
def create_share(patient_id: str, authorization: Optional[str] = Header(None)):
    auth = get_auth_user(authorization)

    owned = (
        supabase.table("patients").select("patient_id")
        .eq("patient_id", patient_id)
        .eq("created_by", auth.user_id)
        .execute()
    )
    if not owned.data:
        raise HTTPException(status_code=404, detail="Patient not found")

    token = secrets.token_urlsafe(16)
    expires_at = (datetime.now(timezone.utc) + timedelta(hours=SHARE_TOKEN_TTL_HOURS)).isoformat()

    row = {
        "patient_id": patient_id,
        "owner_id": auth.user_id,
        "share_token": token,
        "permission": "full",
        "expires_at": expires_at,
    }
    result = supabase.table("patient_shares").insert(row).execute()
    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to create share")

    return {"token": token, "expires_at": expires_at}


# ── REDEEM a share token (any logged-in user, scanning the QR) ─────
@router.post("/redeem")
def redeem_share(body: RedeemBody, authorization: Optional[str] = Header(None)):
    auth = get_auth_user(authorization)

    share = supabase.table("patient_shares").select("*").eq("share_token", body.token).execute()
    if not share.data:
        raise HTTPException(status_code=404, detail="Invalid or expired share code")

    row = share.data[0]

    if row.get("redeemed_at"):
        raise HTTPException(status_code=400, detail="This share code has already been used")

    expires_at = row.get("expires_at")
    if expires_at and datetime.fromisoformat(expires_at.replace("Z", "+00:00")) < datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="This share code has expired")

    if row.get("owner_id") == auth.user_id:
        raise HTTPException(status_code=400, detail="You already own this patient")

    updated = (
        supabase.table("patient_shares")
        .update({
            "shared_with_user_id": auth.user_id,
            "redeemed_at": datetime.now(timezone.utc).isoformat(),
        })
        .eq("id", row["id"])
        .execute()
    )
    if not updated.data:
        raise HTTPException(status_code=500, detail="Failed to redeem share")

    patient = supabase.table("patients").select("*").eq("patient_id", row["patient_id"]).execute()
    return {"linked": True, "patient": patient.data[0] if patient.data else None}


# ── LIST patients shared with me ────────────────────────────────────
@router.get("/shared-with-me")
def get_shared_with_me(authorization: Optional[str] = Header(None)):
    auth = get_auth_user(authorization)
    shares = (
        supabase.table("patient_shares").select("*")
        .eq("shared_with_user_id", auth.user_id)
        .not_.is_("redeemed_at", "null")
        .execute()
    )
    return shares.data or []


# ── REVOKE a share (owner only) ─────────────────────────────────────
@router.delete("/{share_id}")
def revoke_share(share_id: str, authorization: Optional[str] = Header(None)):
    auth = get_auth_user(authorization)
    result = (
        supabase.table("patient_shares").delete()
        .eq("id", share_id)
        .eq("owner_id", auth.user_id)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Share not found")
    return {"revoked": True}
