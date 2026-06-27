from fastapi import APIRouter, Query
from typing import Optional
from database import supabase

router = APIRouter()


@router.get("/{patient_id}")
def get_timeline(
    patient_id: str,
    event_type: Optional[str] = Query(None, description="Filter by event_type, e.g. 'vital_change'"),
    category: Optional[str] = Query(None, description="Filter by category, e.g. 'heart_rate'"),
    start_date: Optional[str] = Query(None, description="ISO date, e.g. 2026-06-01"),
    end_date: Optional[str] = Query(None, description="ISO date, e.g. 2026-06-30"),
    limit: int = 200,
):
    query = (
        supabase.table("health_events")
        .select("*")
        .eq("patient_id", patient_id)
        .order("occurred_at", desc=True)
        .limit(limit)
    )

    if event_type:
        query = query.eq("event_type", event_type)
    if category:
        query = query.eq("category", category)
    if start_date:
        query = query.gte("occurred_at", start_date)
    if end_date:
        # add time component so the end date is inclusive of the whole day
        query = query.lte("occurred_at", f"{end_date}T23:59:59")

    result = query.execute()
    return result.data


@router.get("/{patient_id}/categories")
def get_timeline_categories(patient_id: str):
    """Returns the distinct event_type + category values present for this patient,
    so the frontend can build filter pills dynamically instead of hardcoding them."""
    result = (
        supabase.table("health_events")
        .select("event_type,category")
        .eq("patient_id", patient_id)
        .execute()
    )
    types = sorted({r["event_type"] for r in result.data})
    categories = sorted({r["category"] for r in result.data})
    return {"event_types": types, "categories": categories}
