from fastapi import APIRouter, HTTPException, Header
from typing import Optional
from database import supabase
from datetime import datetime
import jwt
import os

router = APIRouter()

JWT_SECRET = os.getenv("JWT_SECRET", "healnet-secret-key")


class AuthUser:
    def __init__(self, user_id: str, kind: str):
        self.user_id = user_id
        self.kind = kind

    @property
    def is_org(self) -> bool:
        return self.kind == "org"


# ── Helper: get user identity from token (fails CLOSED, not open) ─
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


# ── Helper: which patient_ids does this user own ──────────────────
def get_owned_patient_ids(user_id: str) -> list:
    result = (
        supabase.table("patients")
        .select("patient_id")
        .eq("created_by", user_id)
        .execute()
    )
    return [p["patient_id"] for p in result.data]


# ── GET ALL ALERTS ────────────────────────────────────────────────
# org        -> every alert in the system
# solo/staff -> only alerts belonging to patients they created
@router.get("/")
def get_alerts(
    limit: int = 50,
    unacknowledged_only: bool = False,
    authorization: Optional[str] = Header(None),
):
    auth = get_auth_user(authorization)
    query = supabase.table("alert_log").select("*").order("recorded_at", desc=True)

    if not auth.is_org:
        owned_ids = get_owned_patient_ids(auth.user_id)
        if not owned_ids:
            return []
        query = query.in_("patient_id", owned_ids)

    if unacknowledged_only:
        query = query.eq("acknowledged", False)

    query = query.limit(limit)
    return query.execute().data


# ── GET ALERTS FOR A PATIENT ──────────────────────────────────────
@router.get("/{patient_id}")
def get_patient_alerts(patient_id: str, authorization: Optional[str] = Header(None)):
    auth = get_auth_user(authorization)

    if not auth.is_org:
        owned_ids = get_owned_patient_ids(auth.user_id)
        if patient_id not in owned_ids:
            raise HTTPException(status_code=404, detail="Patient not found")

    result = (
        supabase.table("alert_log")
        .select("*")
        .eq("patient_id", patient_id)
        .order("recorded_at", desc=True)
        .execute()
    )
    return result.data


# ── ACKNOWLEDGE AN ALERT ──────────────────────────────────────────
@router.patch("/{alert_id}/acknowledge")
def acknowledge_alert(alert_id: str, ack_by: str = "staff", authorization: Optional[str] = Header(None)):
    auth = get_auth_user(authorization)

    existing = supabase.table("alert_log").select("id,patient_id").eq("id", alert_id).execute()
    if not existing.data:
        raise HTTPException(status_code=404, detail="Alert not found")

    if not auth.is_org:
        owned_ids = get_owned_patient_ids(auth.user_id)
        if existing.data[0]["patient_id"] not in owned_ids:
            raise HTTPException(status_code=404, detail="Alert not found")

    result = supabase.table("alert_log").update({
        "acknowledged": True,
        "ack_by":       ack_by,
        "ack_time":     datetime.utcnow().isoformat()
    }).eq("id", alert_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Alert not found")
    return result.data[0]


# ── ALERT STATS SUMMARY ───────────────────────────────────────────
@router.get("/stats/summary")
def alert_stats(authorization: Optional[str] = Header(None)):
    auth = get_auth_user(authorization)
    query = supabase.table("alert_log").select("category,acknowledged,patient_id")

    if not auth.is_org:
        owned_ids = get_owned_patient_ids(auth.user_id)
        if not owned_ids:
            return {"total": 0, "critical": 0, "warnings": 0, "unacknowledged": 0}
        query = query.in_("patient_id", owned_ids)

    all_alerts = query.execute().data

    total    = len(all_alerts)
    critical = sum(1 for a in all_alerts if a["category"] == "Critical")
    warnings = sum(1 for a in all_alerts if a["category"] == "Warning")
    unacked  = sum(1 for a in all_alerts if not a["acknowledged"])
    return {
        "total":           total,
        "critical":        critical,
        "warnings":        warnings,
        "unacknowledged":  unacked
    }
