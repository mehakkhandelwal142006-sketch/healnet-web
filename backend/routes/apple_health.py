"""
apple_health.py — Apple Health integration via Health Auto Export app.

HOW IT WORKS:
1. User installs "Health Auto Export" (free) on iPhone
2. They set the webhook URL to: https://YOUR_APP_URL/apple_health (or use ngrok locally)
3. The app POSTs JSON with steps, heart rate, sleep data automatically
4. We store it in Supabase under the logged-in user's ID
5. The UI reads from Supabase and displays it — same as Google Fit

SUPABASE TABLE (run this SQL in Supabase dashboard):
------------------------------------------------------
create table apple_health_data (
    id uuid default gen_random_uuid() primary key,
    user_id text not null,
    date date not null,
    metric text not null,         -- 'steps' | 'heart_rate' | 'sleep_hours'
    value float not null,
    created_at timestamptz default now(),
    unique(user_id, date, metric)
);
------------------------------------------------------
"""

import os
from datetime import datetime, timedelta
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
TABLE        = "apple_health_data"


def _client() -> Client:
    return create_client(SUPABASE_URL, SUPABASE_KEY)


# ── Webhook payload parser ────────────────────────────────────────────────────
# Health Auto Export sends JSON like:
# { "data": [ { "name": "Step Count", "units": "count", "data": [{"date":"2024-01-01 00:00:00","qty":8200}, ...] } ] }

def parse_and_store(payload: dict, user_id: str) -> dict:
    """
    Parse the Health Auto Export webhook payload and upsert into Supabase.
    Returns a summary of what was stored.
    """
    client  = _client()
    summary = {"steps": 0, "heart_rate": 0, "sleep_hours": 0, "errors": []}

    metric_map = {
        # Health Auto Export metric names → our column name
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
                raw_date = point.get("date", "")[:10]   # "2024-01-01"
                qty      = float(point.get("qty", 0) or 0)
                if qty <= 0:
                    continue

                # Sleep comes in minutes from Health Auto Export — convert to hours
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
            # Upsert — if same user/date/metric exists, update value
            client.table(TABLE).upsert(rows, on_conflict="user_id,date,metric").execute()

    return summary


# ── Read helpers (called by the UI) ──────────────────────────────────────────

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
    """Returns True if this user has any Apple Health data stored."""
    client   = _client()
    response = (
        client.table(TABLE)
        .select("id")
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )
    return bool(response.data)
