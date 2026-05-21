"""
routes/smartwatch.py
Handles:
1. CSV upload from any smartwatch (Apple Health, Fitbit, Samsung, Garmin)
2. Google Fit OAuth connect + data fetch
"""
from fastapi import APIRouter, UploadFile, File, HTTPException
from typing import Optional
import io, csv, json, os
from datetime import datetime, timedelta

router = APIRouter()

# ── 1. CSV UPLOAD ─────────────────────────────────────────────────
@router.post("/upload-csv")
async def upload_smartwatch_csv(file: UploadFile = File(...)):
    """
    Upload a CSV file exported from any smartwatch.
    Returns parsed vitals data ready for charts.
    """
    if not file.filename.endswith(".csv"):
        raise HTTPException(status_code=400, detail="Only CSV files are supported")

    contents = await file.read()
    text     = contents.decode("utf-8", errors="ignore")

    try:
        reader  = csv.DictReader(io.StringIO(text))
        rows    = list(reader)
        if not rows:
            raise HTTPException(status_code=400, detail="CSV file is empty")

        # Normalize column names
        cols = list(rows[0].keys())
        cols_lower = [c.strip().lower().replace(" ", "_") for c in cols]
        col_map = dict(zip(cols_lower, cols))

        def find_col(keywords):
            for kw in keywords:
                for cl, orig in col_map.items():
                    if kw in cl:
                        return orig
            return None

        date_col  = find_col(["date","time","start","timestamp"])
        hr_col    = find_col(["heart_rate","heartrate","bpm","pulse"])
        steps_col = find_col(["steps","step_count","step"])
        sleep_col = find_col(["sleep","sleep_duration","sleep_hours"])
        spo2_col  = find_col(["spo2","oxygen","blood_oxygen"])
        cal_col   = find_col(["calorie","calories","energy"])

        # Parse rows
        heart_rate = []
        steps      = []
        sleep      = []
        spo2       = []
        calories   = []

        for row in rows[:1000]:  # limit to 1000 rows
            date_val = row.get(date_col, "") if date_col else ""
            try:
                date_str = str(datetime.fromisoformat(date_val.split("T")[0]).date()) if date_val else ""
            except Exception:
                date_str = date_val[:10] if date_val else ""

            def safe(col, key, is_float=True):
                if not col: return
                v = row.get(col, "")
                try:
                    val = float(v) if is_float else int(v)
                    if val > 0:
                        return {"date": date_str, key: round(val, 1)}
                except Exception:
                    pass
                return None

            if hr_val    := safe(hr_col,    "heart_rate"): heart_rate.append(hr_val)
            if steps_val := safe(steps_col, "steps", False): steps.append(steps_val)
            if sleep_val := safe(sleep_col, "sleep_hours"): sleep.append(sleep_val)
            if spo2_val  := safe(spo2_col,  "spo2"): spo2.append(spo2_val)
            if cal_val   := safe(cal_col,   "calories"): calories.append(cal_val)

        return {
            "total_records": len(rows),
            "columns_detected": {
                "date":       date_col,
                "heart_rate": hr_col,
                "steps":      steps_col,
                "sleep":      sleep_col,
                "spo2":       spo2_col,
                "calories":   cal_col,
            },
            "data": {
                "heart_rate": heart_rate[:100],
                "steps":      steps[:100],
                "sleep":      sleep[:100],
                "spo2":       spo2[:100],
                "calories":   calories[:100],
            },
            "summary": {
                "avg_heart_rate": round(sum(h["heart_rate"] for h in heart_rate) / len(heart_rate), 1) if heart_rate else None,
                "avg_steps":      round(sum(s["steps"]      for s in steps)      / len(steps),      1) if steps      else None,
                "avg_sleep":      round(sum(s["sleep_hours"]for s in sleep)      / len(sleep),      1) if sleep      else None,
                "avg_spo2":       round(sum(s["spo2"]       for s in spo2)       / len(spo2),       1) if spo2       else None,
                "avg_calories":   round(sum(c["calories"]   for c in calories)   / len(calories),   1) if calories   else None,
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to parse CSV: {str(e)}")


# ── 2. GOOGLE FIT AUTH URL ────────────────────────────────────────
@router.get("/google-fit/auth-url")
def google_fit_auth_url():
    """Returns Google OAuth URL for Google Fit."""
    try:
        CLIENT_ID     = os.getenv("GOOGLE_CLIENT_ID", "")
        CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET", "")
        REDIRECT_URI  = os.getenv("GOOGLE_REDIRECT_URI", "http://localhost:3000/google-callback")

        if not CLIENT_ID or not CLIENT_SECRET:
            raise HTTPException(status_code=503, detail="Google Fit not configured. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to environment variables.")

        from google_auth_oauthlib.flow import Flow
        os.environ["OAUTHLIB_INSECURE_TRANSPORT"] = "1"

        flow = Flow.from_client_config(
            {"web": {
                "client_id":     CLIENT_ID,
                "client_secret": CLIENT_SECRET,
                "auth_uri":      "https://accounts.google.com/o/oauth2/auth",
                "token_uri":     "https://oauth2.googleapis.com/token",
                "redirect_uris": [REDIRECT_URI]
            }},
            scopes=[
                "https://www.googleapis.com/auth/fitness.activity.read",
                "https://www.googleapis.com/auth/fitness.heart_rate.read",
                "https://www.googleapis.com/auth/fitness.sleep.read",
                "https://www.googleapis.com/auth/fitness.oxygen_saturation.read",
                "https://www.googleapis.com/auth/fitness.body.read",
            ],
            redirect_uri=REDIRECT_URI
        )
        auth_url, state = flow.authorization_url(
            access_type="offline",
            include_granted_scopes="true",
            prompt="consent"
        )
        return {"auth_url": auth_url, "state": state}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── 3. GOOGLE FIT TOKEN EXCHANGE ──────────────────────────────────
@router.post("/google-fit/exchange")
def google_fit_exchange(body: dict):
    """Exchange OAuth code for access token."""
    try:
        from google_auth_oauthlib.flow import Flow
        from google_fit import get_flow

        os.environ["OAUTHLIB_INSECURE_TRANSPORT"] = "1"
        code = body.get("code")
        if not code:
            raise HTTPException(status_code=400, detail="No code provided")

        flow = get_flow()
        flow.fetch_token(code=code)
        creds = flow.credentials

        return {
            "token":         creds.token,
            "refresh_token": creds.refresh_token,
            "token_uri":     creds.token_uri,
            "client_id":     creds.client_id,
            "client_secret": creds.client_secret,
            "scopes":        list(creds.scopes)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── 4. GOOGLE FIT DATA FETCH ──────────────────────────────────────
@router.post("/google-fit/data")
def google_fit_data(body: dict):
    """Fetch data from Google Fit using stored token."""
    try:
        from google.oauth2.credentials import Credentials
        from google.auth.transport.requests import Request
        from googleapiclient.discovery import build
        from google_fit import fetch_steps, fetch_heart_rate, fetch_calories, fetch_sleep

        token_data = body.get("token")
        days       = body.get("days", 30)

        if not token_data:
            raise HTTPException(status_code=400, detail="No token provided")

        creds = Credentials(
            token=token_data["token"],
            refresh_token=token_data["refresh_token"],
            token_uri=token_data["token_uri"],
            client_id=token_data["client_id"],
            client_secret=token_data["client_secret"],
            scopes=token_data["scopes"]
        )
        if creds.expired and creds.refresh_token:
            creds.refresh(Request())

        service    = build("fitness", "v1", credentials=creds, cache_discovery=False)
        steps_data = fetch_steps(service, days)
        hr_data    = fetch_heart_rate(service, days)
        cal_data   = fetch_calories(service, days)
        sleep_data = fetch_sleep(service, days)

        def avg(data, key):
            vals = [d[key] for d in data if d.get(key, 0) > 0]
            return round(sum(vals)/len(vals), 1) if vals else None

        return {
            "data": {
                "steps":      steps_data,
                "heart_rate": hr_data,
                "calories":   cal_data,
                "sleep":      sleep_data,
            },
            "summary": {
                "avg_steps":      avg(steps_data, "steps"),
                "avg_heart_rate": avg(hr_data,    "heart_rate"),
                "avg_calories":   avg(cal_data,   "calories"),
                "avg_sleep":      avg(sleep_data, "sleep_hours"),
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
