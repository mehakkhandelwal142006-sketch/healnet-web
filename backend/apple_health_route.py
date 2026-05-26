# backend/routes/apple_health.py
# Upload this to: healnet-web/backend/routes/apple_health.py

from fastapi import APIRouter, Request, HTTPException, Depends
from fastapi.responses import JSONResponse
from datetime import datetime, timedelta
import os
from supabase import create_client

router = APIRouter()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
TABLE        = "apple_health_data"

# Run this SQL once in Supabase dashboard:
# create table apple_health_data (
#   id uuid default gen_random_uuid() primary key,
#   user_id text not null,
#   date date not null,
#   metric text not null,
#   value float not null,
#   created_at timestamptz default now(),
#   unique(user_id, date, metric)
# );

def _db():
    return create_client(SUPABASE_URL, SUPABASE_KEY)

METRIC_MAP = {
    "step count":         "steps",
    "steps":              "steps",
    "heart rate":         "heart_rate",
    "resting heart rate": "heart_rate",
    "sleep analysis":     "sleep_hours",
    "sleep":              "sleep_hours",
}

@router.post("/webhook")
async def apple_health_webhook(request: Request):
    """
    Health Auto Export POSTs here automatically.
    URL to put in Health Auto Export:
    https://healnet-web-production.up.railway.app/api/apple-health/webhook?user_id=USER_ID
    """
    user_id = request.query_params.get("user_id")
    if not user_id:
        raise HTTPException(status_code=400, detail="user_id required")

    try:
        payload = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    db      = _db()
    summary = {"steps": 0, "heart_rate": 0, "sleep_hours": 0}

    for entry in payload.get("data", []):
        metric_key = METRIC_MAP.get(entry.get("name", "").lower().strip())
        if not metric_key:
            continue
        rows = []
        for point in entry.get("data", []):
            try:
                qty = float(point.get("qty", 0) or 0)
                if qty <= 0:
                    continue
                if metric_key == "sleep_hours":
                    qty = round(qty / 60, 2)   # minutes → hours
                rows.append({
                    "user_id": user_id,
                    "date":    point.get("date", "")[:10],
                    "metric":  metric_key,
                    "value":   round(qty, 2),
                })
                summary[metric_key] += 1
            except Exception:
                continue
        if rows:
            db.table(TABLE).upsert(rows, on_conflict="user_id,date,metric").execute()

    return {"status": "ok", "stored": summary}


@router.get("/data")
async def get_apple_health_data(user_id: str, days: int = 30):
    """Frontend calls this to fetch stored Apple Health data."""
    db    = _db()
    since = (datetime.now() - timedelta(days=days)).date().isoformat()

    def fetch(metric):
        r = (db.table(TABLE)
               .select("date, value")
               .eq("user_id", user_id)
               .eq("metric", metric)
               .gte("date", since)
               .order("date")
               .execute())
        return [{"date": row["date"], metric: row["value"]} for row in (r.data or [])]

    steps_data = fetch("steps")
    hr_data    = fetch("heart_rate")
    sleep_data = fetch("sleep_hours")

    def avg(data, key):
        vals = [d[key] for d in data if d.get(key, 0) > 0]
        return round(sum(vals) / len(vals), 1) if vals else None

    has_data = bool(steps_data or hr_data or sleep_data)

    return {
        "has_data":      has_data,
        "total_records": len(steps_data) + len(hr_data) + len(sleep_data),
        "source":        "apple_health",
        "summary": {
            "avg_steps":      avg(steps_data, "steps"),
            "avg_heart_rate": avg(hr_data,    "heart_rate"),
            "avg_sleep":      avg(sleep_data, "sleep_hours"),
        },
        "data": {
            "steps":      steps_data,
            "heart_rate": hr_data,
            "sleep_hours": sleep_data,
        }
    }
