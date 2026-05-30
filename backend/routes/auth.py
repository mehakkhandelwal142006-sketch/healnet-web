from fastapi import APIRouter, HTTPException, Header, Depends
from pydantic import BaseModel
from typing import Optional
from database import supabase
import hashlib, uuid, os
from datetime import datetime, timedelta
import jwt

router = APIRouter()

JWT_SECRET = os.getenv("JWT_SECRET", "healnet-secret-key")


# ─────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────

def hash_password(password: str) -> str:
    return hashlib.sha256(password.encode()).hexdigest()


def create_token(user_id: str, email: str, kind: str, org_id: Optional[str] = None) -> str:
    payload = {
        "sub":    user_id,
        "email":  email,
        "kind":   kind,
        "org_id": org_id,
        "exp":    datetime.utcnow() + timedelta(days=7),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm="HS256")


# ─────────────────────────────────────────────
# Shared dependency — use in any protected route
# ─────────────────────────────────────────────

def get_current_user(authorization: str = Header(...)) -> dict:
    """
    Decodes the Bearer token and returns the user payload.
    Raises 401 if the token is missing, expired, or invalid.

    Returns dict with keys: sub, email, kind, org_id
    """
    try:
        token   = authorization.replace("Bearer ", "").strip()
        payload = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")


def require_org(current_user: dict = Depends(get_current_user)) -> dict:
    """
    Dependency that only allows organisation accounts through.
    Individual (solo) accounts receive a 403.
    """
    if current_user.get("kind") != "org":
        raise HTTPException(
            status_code=403,
            detail="Access denied. This action requires an organisation account.",
        )
    return current_user


# ─────────────────────────────────────────────
# Request schemas
# ─────────────────────────────────────────────

class SignupRequest(BaseModel):
    name:     str
    email:    str
    password: str
    kind:     str = "solo"   # "solo" | "org"
    org_id:   Optional[str] = None


class LoginRequest(BaseModel):
    email:    str
    password: str


# ─────────────────────────────────────────────
# Routes
# ─────────────────────────────────────────────

@router.post("/signup")
def signup(body: SignupRequest):
    existing = supabase.table("users").select("id").eq("email", body.email).execute()
    if existing.data:
        raise HTTPException(status_code=400, detail="Email already registered")

    # Validate kind
    if body.kind not in ("solo", "org"):
        raise HTTPException(status_code=400, detail="kind must be 'solo' or 'org'")

    user_id = str(uuid.uuid4())

    result = supabase.table("users").insert({
        "id":            user_id,
        "email":         body.email,
        "name":          body.name,
        "kind":          body.kind,
        "org_id":        body.org_id,
        "password_hash": hash_password(body.password),
    }).execute()

    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to create user")

    token = create_token(user_id, body.email, body.kind, body.org_id)
    return {
        "token": token,
        "user": {
            "id":    user_id,
            "email": body.email,
            "name":  body.name,
            "kind":  body.kind,
        },
    }


@router.post("/login")
def login(body: LoginRequest):
    result = supabase.table("users").select("*").eq("email", body.email).execute()
    if not result.data:
        raise HTTPException(status_code=401, detail="Invalid email or password")

    user = result.data[0]

    if user["password_hash"] != hash_password(body.password):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    supabase.table("users").update({
        "last_login": datetime.utcnow().isoformat()
    }).eq("id", user["id"]).execute()

    token = create_token(user["id"], user["email"], user["kind"], user.get("org_id"))
    return {
        "token": token,
        "user": {
            "id":    user["id"],
            "email": user["email"],
            "name":  user["name"],
            "kind":  user["kind"],
        },
    }


@router.get("/me")
def get_me(current_user: dict = Depends(get_current_user)):
    result = supabase.table("users").select(
        "id,email,name,kind,org_id,created_at"
    ).eq("id", current_user["sub"]).execute()

    if not result.data:
        raise HTTPException(status_code=404, detail="User not found")
    return result.data[0]
