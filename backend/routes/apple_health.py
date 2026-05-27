"""
apple_health.py — Apple Health integration via Health Auto Export app.

HOW IT WORKS:
1. User installs "Health Auto Export" (free) on iPhone
2. They set the webhook URL to: https://YOUR_APP_URL/api/apple-health/webhook
3. The app POSTs JSON with steps, heart rate, sleep data automatically
4. We store it in Supabase under the logged-in user's ID
5. The UI reads from Supabase and displays it — same as Google Fit

SUPABASE TABLE (run this SQL in Supabase dashboard):
------------------------------------------------------
create table apple_health_data (
    id uuid default gen_random_uuid() primary key,
    user_id text not null,
    date date not null,
    metric text not null,
    value float not null,
    created_at timestamptz default now(),
    unique(user_id, date, metric)
);
------------------------------------------------------
"""

import os
from datetime import datetime, timedelta
from fastapi import APIRouter, HTTPException, Request, Header
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
TABLE        = "apple_health_data"

router = APIRouter()


def _client() -> Client:
    return create_client(SUPABASE_URL, SUPABASE_KEY)


# ── Webhook payload parser ────────────────────────────────────────────────────

def parse_and_store(payload: dict, user_id: str) -> dict:
    client  = _client()
    summary = {"steps": 0, "heart_rate": 0, "sleep_hours": 0, "errors": []}

    metric_map = {
        "step count":          "steps",
        "steps":               "steps",
        "heart rate":          "heart_rate",
        "resting heart rate":  "heart_rate",
        "sleep analysis":      "sleep_hours",
        "sleep":               "sleep_hours",
    }

    for entry in payload.get("data", []):
        metric_name = entry.get("name", "").lower().strip()
        metric_key  = metric_map.get(metric_name)
        if not metric_key:
            continue

        rows = []
        for point in entry.get("data", []):
            try:
                raw_date = point.get("date", "")[:10]
                qty      = float(point.get("qty", 0) or 0)
                if qty <= 0:
                    continue
                if metric_key == "sleep_hours":
                    qty = round(qty / 60, 2)
                rows.append({
                    "user_id": user_id,
                    "date":    raw_date,
                    "metric":  metric_key,
                    "value":   round(qty, 2),
                })
                summary[metric_key] += 1
            except Exception as e:
                summary["errors"].append(str(e))

        if rows:
            client.table(TABLE).upsert(rows, on_conflict="user_id,date,metric").execute()

    return summary


# ── Read helpers ──────────────────────────────────────────────────────────────

def _fetch(user_id: str, metric: str, days: int) -> list[dict]:
    client   = _client()
    since    = (datetime.now() - timedelta(days=days)).date().isoformat()
    response = (
        client.table(TABLE)
        .select("date, value")
        .eq("user_id", user_id)
        .eq("metric", metric)
        .gte("date", since)
        .order("date")
        .execute()
    )
    return [{"date": r["date"], metric: r["value"]} for r in (response.data or [])]


def fetch_steps(user_id: str, days: int = 30) -> list[dict]:
    return _fetch(user_id, "steps", days)

def fetch_heart_rate(user_id: str, days: int = 30) -> list[dict]:
    return _fetch(user_id, "heart_rate", days)

def fetch_sleep(user_id: str, days: int = 30) -> list[dict]:
    return _fetch(user_id, "sleep_hours", days)

def has_data(user_id: str) -> bool:
    client   = _client()
    response = (
        client.table(TABLE)
        .select("id")
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )
    return bool(response.data)


# ── FastAPI Routes ────────────────────────────────────────────────────────────

@router.post("/webhook")
async def apple_health_webhook(request: Request, x_user_id: str = Header(...)):
    """
    Webhook endpoint for Health Auto Export app.
    Requires X-User-Id header with the user's ID.
    """
    try:
        payload = await request.json()
        summary = parse_and_store(payload, x_user_id)
        return {"status": "ok", "summary": summary}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/steps/{user_id}")
def get_steps(user_id: str, days: int = 30):
    return {"data": fetch_steps(user_id, days)}


@router.get("/heart-rate/{user_id}")
def get_heart_rate(user_id: str, days: int = 30):
    return {"data": fetch_heart_rate(user_id, days)}


@router.get("/sleep/{user_id}")
def get_sleep(user_id: str, days: int = 30):
    return {"data": fetch_sleep(user_id, days)}


@router.get("/has-data/{user_id}")
def check_has_data(user_id: str):
    return {"has_data": has_data(user_id)}
