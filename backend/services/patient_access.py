"""
services/patient_access.py
─────────────────────────────────────────────────────────────────
Shared helper used across route files to check whether a user can
access a given patient - either because they created it, or because
it was shared with them via a redeemed QR link (patient_shares).

Sharing is full-access (not view-only): a linked family member can
add vitals, symptoms, etc. for that patient, same as the owner.
"""
from database import supabase


def has_patient_access(patient_id: str, user_id: str) -> bool:
    owned = (
        supabase.table("patients").select("patient_id")
        .eq("patient_id", patient_id)
        .eq("created_by", user_id)
        .execute()
    )
    if owned.data:
        return True

    shared = (
        supabase.table("patient_shares").select("id")
        .eq("patient_id", patient_id)
        .eq("shared_with_user_id", user_id)
        .not_.is_("redeemed_at", "null")
        .execute()
    )
    return bool(shared.data)


def get_accessible_patient_ids(user_id: str) -> list:
    """All patient_ids this user can access: owned + shared-with-them."""
    owned = supabase.table("patients").select("patient_id").eq("created_by", user_id).execute()
    owned_ids = [p["patient_id"] for p in (owned.data or [])]

    shared = (
        supabase.table("patient_shares").select("patient_id")
        .eq("shared_with_user_id", user_id)
        .not_.is_("redeemed_at", "null")
        .execute()
    )
    shared_ids = [s["patient_id"] for s in (shared.data or [])]

    return list(set(owned_ids + shared_ids))
