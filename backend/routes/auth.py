from fastapi import APIRouter, HTTPException, Header
from pydantic import BaseModel
from typing import Optional
from database import supabase
import hashlib, uuid, os
from datetime import datetime, timedelta
import jwt
from google.oauth2 import id_token
from google.auth.transport import requests as google_requests

router = APIRouter()

JWT_SECRET = os.getenv("JWT_SECRET", "healnet-secret-key")
GOOGLE_WEB_CLIENT_ID = os.getenv(
    "GOOGLE_WEB_CLIENT_ID",
    "560479363796-6c16e4olgj39bcplh8r0egc2d5klb0gv.apps.googleusercontent.com"
)

def hash_password(password: str) -> str:
    return hashlib.sha256(password.encode()).hexdigest()

def create_token(user_id: str, email: str, kind: str) -> str:
    payload = {
        "sub": user_id,
        "email": email,
        "kind": kind,
        "exp": datetime.utcnow() + timedelta(days=7)
    }
    return jwt.encode(payload, JWT_SECRET, algorithm="HS256")

class SignupRequest(BaseModel):
    name: str
    email: str
    password: str
    kind: str = "solo"
    org_id: Optional[str] = None

class LoginRequest(BaseModel):
    email: str
    password: str

class GoogleLoginRequest(BaseModel):
    id_token: str

@router.post("/signup")
def signup(body: SignupRequest):
    existing = supabase.table("users").select("id").eq("email", body.email).execute()
    if existing.data:
        raise HTTPException(status_code=400, detail="Email already registered")
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
    token = create_token(user_id, body.email, body.kind)
    return {
        "token": token,
        "user": {
            "id":    user_id,
            "email": body.email,
            "name":  body.name,
            "kind":  body.kind
        }
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
    token = create_token(user["id"], user["email"], user["kind"])
    return {
        "token": token,
        "user": {
            "id":    user["id"],
            "email": user["email"],
            "name":  user["name"],
            "kind":  user["kind"]
        }
    }

# ═══════════════════════════════════════════════════════════════════
#  GOOGLE LOGIN
# ═══════════════════════════════════════════════════════════════════
@router.post("/google")
def google_login(body: GoogleLoginRequest):
    try:
        # Verify the Google ID token
        idinfo = id_token.verify_oauth2_token(
            body.id_token,
            google_requests.Request(),
            GOOGLE_WEB_CLIENT_ID,
        )
    except ValueError:
        raise HTTPException(status_code=401, detail="Invalid Google token")

    email = idinfo.get("email")
    name  = idinfo.get("name", email.split("@")[0])

    if not email:
        raise HTTPException(status_code=400, detail="Google account has no email")

    # Check if user already exists
    existing = supabase.table("users").select("*").eq("email", email).execute()

    if existing.data:
        user = existing.data[0]
        supabase.table("users").update({
            "last_login": datetime.utcnow().isoformat()
        }).eq("id", user["id"]).execute()
    else:
        # Create new user with a random password hash (they'll never use password login)
        user_id = str(uuid.uuid4())
        random_password_hash = hash_password(str(uuid.uuid4()))
        result = supabase.table("users").insert({
            "id":            user_id,
            "email":         email,
            "name":          name,
            "kind":          "solo",
            "password_hash": random_password_hash,
            "auth_provider": "google",
        }).execute()
        if not result.data:
            raise HTTPException(status_code=500, detail="Failed to create user")
        user = result.data[0]

    token = create_token(user["id"], user["email"], user["kind"])
    return {
        "token": token,
        "user": {
            "id":    user["id"],
            "email": user["email"],
            "name":  user["name"],
            "kind":  user["kind"]
        }
    }

@router.get("/me")
def get_me(authorization: str = Header(...)):
    try:
        token   = authorization.replace("Bearer ", "")
        payload = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
        result  = supabase.table("users").select(
            "id,email,name,kind,org_id,created_at"
        ).eq("id", payload["sub"]).execute()
        if not result.data:
            raise HTTPException(status_code=404, detail="User not found")
        return result.data[0]
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")