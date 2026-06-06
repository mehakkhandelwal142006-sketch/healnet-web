from fastapi import APIRouter, HTTPException, Header, Depends
from pydantic import BaseModel
from typing import Optional
from database import supabase
import hashlib, uuid, os, json, base64
from datetime import datetime, timedelta
import jwt

# ── py_webauthn (pip install webauthn) ───────────────────────────
import webauthn
from webauthn import (
    generate_registration_options,
    verify_registration_response,
    generate_authentication_options,
    verify_authentication_response,
    options_to_json,
    base64url_to_bytes,
)
from webauthn.helpers.structs import (
    AuthenticatorSelectionCriteria,
    UserVerificationRequirement,
    ResidentKeyRequirement,
    AuthenticatorAttachment,
    PublicKeyCredentialDescriptor,
)
from webauthn.helpers.cose import COSEAlgorithmIdentifier

router = APIRouter()

JWT_SECRET  = os.getenv("JWT_SECRET", "healnet-secret-key")
RP_ID       = os.getenv("RP_ID", "localhost")        # ← set to your domain e.g. "healnet.app"
RP_NAME     = os.getenv("RP_NAME", "HealNet")
ORIGIN      = os.getenv("ORIGIN", "http://localhost:3000")  # ← set to your deployed URL

# In-memory challenge store (replace with Redis/Supabase in production)
_challenge_store: dict[str, bytes] = {}


# ─────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────

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


# ─────────────────────────────────────────────────────────────────
# Shared dependency
# ─────────────────────────────────────────────────────────────────

def get_current_user(authorization: str = Header(...)) -> dict:
    try:
        token   = authorization.replace("Bearer ", "").strip()
        payload = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")


def require_org(current_user: dict = Depends(get_current_user)) -> dict:
    if current_user.get("kind") != "org":
        raise HTTPException(
            status_code=403,
            detail="Access denied. This action requires an organisation account.",
        )
    return current_user


# ─────────────────────────────────────────────────────────────────
# Request schemas
# ─────────────────────────────────────────────────────────────────

class SignupRequest(BaseModel):
    name:     str
    email:    str
    password: str
    kind:     str = "solo"
    org_id:   Optional[str] = None


class LoginRequest(BaseModel):
    email: str
    password: str


class WebAuthnRegisterBeginRequest(BaseModel):
    user_id: str    # UUID of the logged-in user


class WebAuthnRegisterCompleteRequest(BaseModel):
    user_id:  str
    credential: dict   # raw JSON from navigator.credentials.create()


class WebAuthnLoginBeginRequest(BaseModel):
    email: str


class WebAuthnLoginCompleteRequest(BaseModel):
    email:      str
    credential: dict   # raw JSON from navigator.credentials.get()


# ─────────────────────────────────────────────────────────────────
# Existing routes (unchanged)
# ─────────────────────────────────────────────────────────────────

@router.post("/signup")
def signup(body: SignupRequest):
    existing = supabase.table("users").select("id").eq("email", body.email).execute()
    if existing.data:
        raise HTTPException(status_code=400, detail="Email already registered")

    if body.kind not in ("solo", "org", "staff"):
        raise HTTPException(status_code=400, detail="Invalid kind")

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


# ─────────────────────────────────────────────────────────────────
# WebAuthn — Registration (one-time fingerprint setup)
# ─────────────────────────────────────────────────────────────────

@router.post("/webauthn/register/begin")
def webauthn_register_begin(
    body: WebAuthnRegisterBeginRequest,
    current_user: dict = Depends(get_current_user),
):
    """
    Step 1 of registration.
    Returns a challenge + options that the browser uses to call
    navigator.credentials.create() — which triggers Touch ID / Windows Hello.
    """
    # Fetch user from DB
    res = supabase.table("users").select("id,email,name").eq("id", body.user_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="User not found")
    user = res.data[0]

    # Fetch any credentials already registered (to exclude them)
    existing_creds = supabase.table("webauthn_credentials") \
        .select("credential_id") \
        .eq("user_id", body.user_id) \
        .execute()

    exclude_creds = []
    for c in (existing_creds.data or []):
        try:
            exclude_creds.append(
                PublicKeyCredentialDescriptor(
                    id=base64url_to_bytes(c["credential_id"])
                )
            )
        except Exception:
            pass

    options = generate_registration_options(
        rp_id=RP_ID,
        rp_name=RP_NAME,
        user_id=user["id"].encode(),
        user_name=user["email"],
        user_display_name=user["name"],
        exclude_credentials=exclude_creds,
        authenticator_selection=AuthenticatorSelectionCriteria(
            authenticator_attachment=AuthenticatorAttachment.PLATFORM,  # device only (no USB keys)
            resident_key=ResidentKeyRequirement.PREFERRED,
            user_verification=UserVerificationRequirement.REQUIRED,     # forces biometric
        ),
        supported_pub_key_algs=[
            COSEAlgorithmIdentifier.ECDSA_SHA_256,
            COSEAlgorithmIdentifier.RSASSA_PKCS1_v1_5_SHA_256,
        ],
    )

    # Store challenge temporarily (keyed by user_id)
    _challenge_store[body.user_id] = options.challenge

    return json.loads(options_to_json(options))


@router.post("/webauthn/register/complete")
def webauthn_register_complete(body: WebAuthnRegisterCompleteRequest):
    """
    Step 2 of registration.
    Verifies the browser's response and saves the public key to Supabase.
    """
    challenge = _challenge_store.pop(body.user_id, None)
    if not challenge:
        raise HTTPException(status_code=400, detail="No challenge found — restart registration")

    try:
        verification = verify_registration_response(
            credential=body.credential,
            expected_challenge=challenge,
            expected_rp_id=RP_ID,
            expected_origin=ORIGIN,
            require_user_verification=True,
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Registration verification failed: {str(e)}")

    # Save credential to Supabase
    cred_id_b64 = base64.urlsafe_b64encode(
        verification.credential_id
    ).rstrip(b"=").decode()

    pub_key_b64 = base64.urlsafe_b64encode(
        verification.credential_public_key
    ).rstrip(b"=").decode()

    supabase.table("webauthn_credentials").upsert({
        "user_id":        body.user_id,
        "credential_id":  cred_id_b64,
        "public_key":     pub_key_b64,
        "sign_count":     verification.sign_count,
        "created_at":     datetime.utcnow().isoformat(),
    }).execute()

    return {"status": "registered", "credential_id": cred_id_b64}


# ─────────────────────────────────────────────────────────────────
# WebAuthn — Authentication (fingerprint login)
# ─────────────────────────────────────────────────────────────────

@router.post("/webauthn/login/begin")
def webauthn_login_begin(body: WebAuthnLoginBeginRequest):
    """
    Step 1 of login.
    Looks up the user's registered credentials and returns a challenge
    for the browser to sign with navigator.credentials.get() — Touch ID / Face ID.
    """
    # Find user
    user_res = supabase.table("users").select("id,email,name,kind,org_id") \
        .eq("email", body.email).execute()
    if not user_res.data:
        raise HTTPException(status_code=404, detail="User not found")
    user = user_res.data[0]

    # Find registered credentials
    creds_res = supabase.table("webauthn_credentials") \
        .select("credential_id") \
        .eq("user_id", user["id"]) \
        .execute()

    if not creds_res.data:
        raise HTTPException(
            status_code=404,
            detail="No fingerprint registered for this account. Please register first."
        )

    allow_creds = []
    for c in creds_res.data:
        try:
            allow_creds.append(
                PublicKeyCredentialDescriptor(
                    id=base64url_to_bytes(c["credential_id"])
                )
            )
        except Exception:
            pass

    options = generate_authentication_options(
        rp_id=RP_ID,
        allow_credentials=allow_creds,
        user_verification=UserVerificationRequirement.REQUIRED,
    )

    # Store challenge keyed by email
    _challenge_store[body.email] = options.challenge

    return json.loads(options_to_json(options))


@router.post("/webauthn/login/complete")
def webauthn_login_complete(body: WebAuthnLoginCompleteRequest):
    """
    Step 2 of login.
    Verifies the browser's signed response and returns a JWT if valid.
    """
    challenge = _challenge_store.pop(body.email, None)
    if not challenge:
        raise HTTPException(status_code=400, detail="No challenge found — restart login")

    # Find user
    user_res = supabase.table("users").select("*").eq("email", body.email).execute()
    if not user_res.data:
        raise HTTPException(status_code=404, detail="User not found")
    user = user_res.data[0]

    # Find matching credential
    raw_id = body.credential.get("rawId") or body.credential.get("id", "")
    cred_res = supabase.table("webauthn_credentials") \
        .select("*") \
        .eq("user_id", user["id"]) \
        .eq("credential_id", raw_id) \
        .execute()

    if not cred_res.data:
        # Try without padding issues — search all user creds
        all_creds = supabase.table("webauthn_credentials") \
            .select("*").eq("user_id", user["id"]).execute()
        if not all_creds.data:
            raise HTTPException(status_code=400, detail="Credential not found")
        cred_row = all_creds.data[0]
    else:
        cred_row = cred_res.data[0]

    # Pad base64 if needed
    def pad(s):
        return s + "=" * (-len(s) % 4)

    stored_pub_key = base64.urlsafe_b64decode(pad(cred_row["public_key"]))
    stored_sign_count = cred_row.get("sign_count", 0)

    try:
        verification = verify_authentication_response(
            credential=body.credential,
            expected_challenge=challenge,
            expected_rp_id=RP_ID,
            expected_origin=ORIGIN,
            credential_public_key=stored_pub_key,
            credential_current_sign_count=stored_sign_count,
            require_user_verification=True,
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Authentication failed: {str(e)}")

    # Update sign count to prevent replay attacks
    supabase.table("webauthn_credentials").update({
        "sign_count": verification.new_sign_count
    }).eq("credential_id", cred_row["credential_id"]).execute()

    # Issue JWT
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


# ─────────────────────────────────────────────────────────────────
# Check if user has fingerprint registered
# ─────────────────────────────────────────────────────────────────

@router.get("/webauthn/status")
def webauthn_status(current_user: dict = Depends(get_current_user)):
    """Returns whether the current user has a fingerprint registered."""
    res = supabase.table("webauthn_credentials") \
        .select("credential_id") \
        .eq("user_id", current_user["sub"]) \
        .execute()
    return {"registered": bool(res.data)}
