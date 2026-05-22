"""
routes/smartwatch.py
Handles:
1. CSV upload from any smartwatch
2. Google Fit OAuth connect + real-time data fetch
"""
from fastapi import APIRouter, UploadFile, File, HTTPException
from pydantic import BaseModel
from typing import Optional
import io, csv, os
from datetime import datetime, timedelta

router = APIRouter()

# ── GOOGLE FIT CONFIG ─────────────────────────────────────────────
CLIENT_ID     = os.getenv("GOOGLE_CLIENT_ID", "")
CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET", "")
REDIRECT_URI  = os.getenv("GOOGLE_REDIRECT_URI", "https://healnet-web.vercel.app/google-callback")

SCOPES = [
    "https://www.googleapis.com/auth/fitness.activity.read",
    "https://www.googleapis.com/auth/fitness.heart_rate.read",
    "https://www.googleapis.com/auth/fitness.sleep.read",
    "https://www.googleapis.com/auth/fitness.oxygen_saturation.read",
    "https://www.googleapis.com/auth/fitness.body.read",
]


# ═══════════════════════════════════════════════════════════════════
# 1. CSV UPLOAD
# ═══════════════════════════════════════════════════════════════════
@router.post("/upload-csv")
async def upload_smartwatch_csv(file: UploadFile = File(...)):
    if not file.filename.endswith(".csv"):
        raise HTTPException(status_code=400, detail="Only CSV files are supported")

    contents = await file.read()
    text     = contents.decode("utf-8", errors="ignore")

    try:
        reader = csv.DictReader(io.StringIO(text))
        rows   = list(reader)
        if not rows:
            raise HTTPException(status_code=400, detail="CSV file is empty")

        cols       = list(rows[0].keys())
        cols_lower = [c.strip().lower().replace(" ", "_") for c in cols]
        col_map    = dict(zip(cols_lower, cols))

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

        heart_rate, steps, sleep, spo2, calories = [], [], [], [], []

        for row in rows[:1000]:
            date_val = row.get(date_col, "") if date_col else ""
            try:
                date_str = str(datetime.fromisoformat(date_val.split("T")[0]).date()) if date_val else ""
            except Exception:
                date_str = date_val[:10] if date_val else ""

            def safe(col, key, is_float=True):
                if not col: return None
                v = row.get(col, "")
                try:
                    val = float(v) if is_float else int(v)
                    if val > 0:
                        return {"date": date_str, key: round(val, 1)}
                except Exception:
                    pass
                return None

            if hr  := safe(hr_col,    "heart_rate"): heart_rate.append(hr)
            if st  := safe(steps_col, "steps", False): steps.append(st)
            if sl  := safe(sleep_col, "sleep_hours"): sleep.append(sl)
            if sp  := safe(spo2_col,  "spo2"): spo2.append(sp)
            if cal := safe(cal_col,   "calories"): calories.append(cal)

        def avg(data, key):
            vals = [d[key] for d in data if d.get(key, 0) > 0]
            return round(sum(vals)/len(vals), 1) if vals else None

        return {
            "source": "csv",
            "total_records": len(rows),
            "columns_detected": {
                "date": date_col, "heart_rate": hr_col,
                "steps": steps_col, "sleep": sleep_col,
                "spo2": spo2_col, "calories": cal_col,
            },
            "data": {
                "heart_rate": heart_rate[:100],
                "steps":      steps[:100],
                "sleep":      sleep[:100],
                "spo2":       spo2[:100],
                "calories":   calories[:100],
            },
            "summary": {
                "avg_heart_rate": avg(heart_rate, "heart_rate"),
                "avg_steps":      avg(steps,      "steps"),
                "avg_sleep":      avg(sleep,       "sleep_hours"),
                "avg_spo2":       avg(spo2,        "spo2"),
                "avg_calories":   avg(calories,    "calories"),
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to parse CSV: {str(e)}")


# ═══════════════════════════════════════════════════════════════════
# 2. GOOGLE FIT — AUTH URL
# ═══════════════════════════════════════════════════════════════════
@router.get("/google-fit/auth-url")
def google_fit_auth_url():
    """Returns Google OAuth URL. Frontend redirects user here."""
    if not CLIENT_ID or not CLIENT_SECRET:
        raise HTTPException(
            status_code=503,
            detail="Google Fit not configured. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to Railway environment variables."
        )
    try:
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
            scopes=SCOPES,
            redirect_uri=REDIRECT_URI
        )
        auth_url, state = flow.authorization_url(
            access_type="offline",
            include_granted_scopes="true",
            prompt="consent"
        )
        return {"auth_url": auth_url, "state": state}
    except ImportError:
        raise HTTPException(status_code=503, detail="google-auth-oauthlib not installed. Add to requirements.txt")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ═══════════════════════════════════════════════════════════════════
# 3. GOOGLE FIT — EXCHANGE CODE FOR TOKEN
# ═══════════════════════════════════════════════════════════════════
class CodeExchange(BaseModel):
    code: str

@router.post("/google-fit/exchange")
def google_fit_exchange(body: CodeExchange):
    """Exchange OAuth code for access token after user logs in with Google."""
    try:
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
            scopes=SCOPES,
            redirect_uri=REDIRECT_URI
        )
        flow.fetch_token(code=body.code)
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
        raise HTTPException(status_code=500, detail=f"Token exchange failed: {str(e)}")


# ═══════════════════════════════════════════════════════════════════
# 4. GOOGLE FIT — FETCH REAL DATA
# ═══════════════════════════════════════════════════════════════════
class FitDataRequest(BaseModel):
    token:        dict
    days:         Optional[int] = 30

@router.post("/google-fit/data")
def google_fit_data(body: FitDataRequest):
    """Fetch real-time data from Google Fit using stored token."""
    try:
        from google.oauth2.credentials import Credentials
        from google.auth.transport.requests import Request
        from googleapiclient.discovery import build

        t = body.token
        creds = Credentials(
            token=t["token"], refresh_token=t["refresh_token"],
            token_uri=t["token_uri"], client_id=t["client_id"],
            client_secret=t["client_secret"], scopes=t["scopes"]
        )
        if creds.expired and creds.refresh_token:
            creds.refresh(Request())

        service = build("fitness", "v1", credentials=creds, cache_discovery=False)

        def ms(days):
            e = datetime.now()
            s = e - timedelta(days=days)
            return int(s.timestamp()*1000), int(e.timestamp()*1000)

        def aggregate(dtype):
            s, e = ms(body.days)
            return service.users().dataset().aggregate(userId="me", body={
                "aggregateBy":  [{"dataTypeName": dtype}],
                "bucketByTime": {"durationMillis": 86400000},
                "startTimeMillis": s, "endTimeMillis": e
            }).execute()

        # ── Steps ─────────────────────────────────────────────────
        steps_data = []
        for b in aggregate("com.google.step_count.delta").get("bucket", []):
            date = datetime.fromtimestamp(int(b["startTimeMillis"])/1000).date()
            val  = sum(pt["value"][0].get("intVal", 0)
                       for ds in b.get("dataset", []) for pt in ds.get("point", []))
            if val > 0: steps_data.append({"date": str(date), "steps": val})

        # ── Heart Rate ────────────────────────────────────────────
        hr_data = []
        for b in aggregate("com.google.heart_rate.bpm").get("bucket", []):
            date = datetime.fromtimestamp(int(b["startTimeMillis"])/1000).date()
            for ds in b.get("dataset", []):
                for pt in ds.get("point", []):
                    bpm = pt["value"][0].get("fpVal", 0)
                    if bpm > 0: hr_data.append({"date": str(date), "heart_rate": round(bpm, 1)})

        # ── Calories ──────────────────────────────────────────────
        cal_data = []
        for b in aggregate("com.google.calories.expended").get("bucket", []):
            date = datetime.fromtimestamp(int(b["startTimeMillis"])/1000).date()
            val  = sum(pt["value"][0].get("fpVal", 0)
                       for ds in b.get("dataset", []) for pt in ds.get("point", []))
            if val > 0: cal_data.append({"date": str(date), "calories": round(val, 1)})

        # ── Sleep ─────────────────────────────────────────────────
        sleep_data = []
        for b in aggregate("com.google.sleep.segment").get("bucket", []):
            date = datetime.fromtimestamp(int(b["startTimeMillis"])/1000).date()
            dur  = sum(
                (int(pt.get("endTimeNanos", 0)) - int(pt.get("startTimeNanos", 0))) / 1e9 / 3600
                for ds in b.get("dataset", []) for pt in ds.get("point", [])
            )
            if dur > 0: sleep_data.append({"date": str(date), "sleep_hours": round(dur, 2)})

        def avg(data, key):
            vals = [d[key] for d in data if d.get(key, 0) > 0]
            return round(sum(vals)/len(vals), 1) if vals else None

        # Return updated token too (in case it was refreshed)
        updated_token = {
            "token":         creds.token,
            "refresh_token": creds.refresh_token,
            "token_uri":     creds.token_uri,
            "client_id":     creds.client_id,
            "client_secret": creds.client_secret,
            "scopes":        list(creds.scopes)
        }

        return {
            "source": "google_fit",
            "days":   body.days,
            "token":  updated_token,
            "data": {
                "steps":      steps_data,
                "heart_rate": hr_data,
                "calories":   cal_data,
                "sleep":      sleep_data,
                "spo2":       [],  # Google Fit SpO2 needs special scope
            },
            "summary": {
                "avg_steps":      avg(steps_data, "steps"),
                "avg_heart_rate": avg(hr_data,    "heart_rate"),
                "avg_calories":   avg(cal_data,   "calories"),
                "avg_sleep":      avg(sleep_data, "sleep_hours"),
                "avg_spo2":       None,
            },
            "total_records": len(steps_data) + len(hr_data) + len(cal_data) + len(sleep_data)
        }

    except ImportError:
        raise HTTPException(status_code=503, detail="google-api-python-client not installed")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Google Fit error: {str(e)}")


# ═══════════════════════════════════════════════════════════════════
# 5. CHECK GOOGLE FIT STATUS
# ═══════════════════════════════════════════════════════════════════
@router.get("/google-fit/status")
def google_fit_status():
    """Check if Google Fit is configured on this server."""
    return {
        "configured": bool(CLIENT_ID and CLIENT_SECRET),
        "redirect_uri": REDIRECT_URI,
        "message": "Ready" if (CLIENT_ID and CLIENT_SECRET) else "Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to Railway"
    }
