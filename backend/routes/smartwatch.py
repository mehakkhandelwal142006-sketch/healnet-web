from fastapi import APIRouter, UploadFile, File, HTTPException, Query
from fastapi.responses import JSONResponse
import pandas as pd
import io
import httpx
import json
from datetime import datetime, timedelta

router = APIRouter()

# ── Helper: parse numeric safely ─────────────────────────────────
def safe_num(val):
    try:
        v = float(val)
        return None if pd.isna(v) else round(v, 2)
    except:
        return None

# ── Helper: summarise a dataframe ────────────────────────────────
def summarise(df: pd.DataFrame) -> dict:
    def avg(col):
        if col in df.columns:
            vals = df[col].dropna()
            return round(float(vals.mean()), 1) if len(vals) else None
        return None

    return {
        "avg_heart_rate":  avg("heart_rate"),
        "avg_steps":       avg("steps"),
        "avg_spo2":        avg("spo2"),
        "avg_sleep":       avg("sleep_hours"),
        "avg_calories":    avg("calories"),
        "avg_systolic_bp": avg("systolic_bp"),
    }

# ═══════════════════════════════════════════════════════════════════
#  CSV UPLOAD
# ═══════════════════════════════════════════════════════════════════
@router.post("/upload-csv")
async def upload_csv(file: UploadFile = File(...)):
    try:
        contents = await file.read()
        df = pd.read_csv(io.BytesIO(contents))
        df.columns = [c.strip().lower().replace(" ", "_") for c in df.columns]

        # ── Normalise common column name variants ─────────────────
        rename = {
            "bpm": "heart_rate", "pulse": "heart_rate", "hr": "heart_rate",
            "step_count": "steps", "total_steps": "steps",
            "oxygen": "spo2", "spo2_%": "spo2", "blood_oxygen": "spo2",
            "sleep": "sleep_hours", "sleep_duration": "sleep_hours",
            "kcal": "calories", "energy": "calories",
            "systolic": "systolic_bp", "diastolic": "diastolic_bp",
            "timestamp": "date", "time": "date", "datetime": "date",
        }
        df.rename(columns={k: v for k, v in rename.items() if k in df.columns}, inplace=True)

        numeric_cols = ["heart_rate", "steps", "spo2", "sleep_hours", "calories", "systolic_bp", "diastolic_bp"]
        for col in numeric_cols:
            if col in df.columns:
                df[col] = pd.to_numeric(df[col], errors="coerce")

        summary = summarise(df)
        total   = len(df)

        # ── Build per-metric time series ──────────────────────────
        data = {}
        date_col = "date" if "date" in df.columns else None

        for metric in ["heart_rate", "steps", "spo2", "sleep_hours", "calories"]:
            if metric in df.columns:
                sub = df[[date_col, metric]].dropna() if date_col else df[[metric]].dropna()
                if date_col:
                    sub = sub.rename(columns={date_col: "date", metric: metric})
                    sub["date"] = sub["date"].astype(str)
                data[metric] = sub.to_dict(orient="records")

        return {
            "source":        "csv",
            "total_records": total,
            "summary":       summary,
            "data":          data,
        }

    except Exception as e:
        raise HTTPException(status_code=400, detail=f"CSV parsing error: {str(e)}")


# ═══════════════════════════════════════════════════════════════════
#  GOOGLE FIT — STATUS CHECK
# ═══════════════════════════════════════════════════════════════════
import os

GOOGLE_CLIENT_ID     = os.getenv("GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET", "")
GOOGLE_REDIRECT_URI  = os.getenv("GOOGLE_REDIRECT_URI", "")

@router.get("/google-fit/status")
async def google_fit_status():
    configured = bool(GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET and GOOGLE_REDIRECT_URI)
    return {"configured": configured}


# ═══════════════════════════════════════════════════════════════════
#  GOOGLE FIT — AUTH URL
# ═══════════════════════════════════════════════════════════════════
@router.get("/google-fit/auth-url")
async def google_fit_auth_url():
    if not GOOGLE_CLIENT_ID:
        raise HTTPException(status_code=503, detail="Google Fit not configured")

    scopes = " ".join([
        "https://www.googleapis.com/auth/fitness.heart_rate.read",
        "https://www.googleapis.com/auth/fitness.activity.read",
        "https://www.googleapis.com/auth/fitness.sleep.read",
        "https://www.googleapis.com/auth/fitness.oxygen_saturation.read",
        "https://www.googleapis.com/auth/fitness.nutrition.read",
    ])

    auth_url = (
        "https://accounts.google.com/o/oauth2/v2/auth"
        f"?client_id={GOOGLE_CLIENT_ID}"
        f"&redirect_uri={GOOGLE_REDIRECT_URI}"
        "&response_type=code"
        f"&scope={scopes}"
        "&access_type=offline"
        "&prompt=consent"
    )
    return {"auth_url": auth_url}


# ═══════════════════════════════════════════════════════════════════
#  GOOGLE FIT — EXCHANGE CODE FOR TOKEN
# ═══════════════════════════════════════════════════════════════════
@router.post("/google-fit/exchange")
async def google_fit_exchange(payload: dict):
    code = payload.get("code")
    if not code:
        raise HTTPException(status_code=400, detail="Missing code")

    async with httpx.AsyncClient() as client:
        resp = await client.post("https://oauth2.googleapis.com/token", data={
            "code":          code,
            "client_id":     GOOGLE_CLIENT_ID,
            "client_secret": GOOGLE_CLIENT_SECRET,
            "redirect_uri":  GOOGLE_REDIRECT_URI,
            "grant_type":    "authorization_code",
        })

    if resp.status_code != 200:
        raise HTTPException(status_code=400, detail="Token exchange failed")

    return resp.json()


# ═══════════════════════════════════════════════════════════════════
#  GOOGLE FIT — FETCH DATA
# ═══════════════════════════════════════════════════════════════════
def nano(dt: datetime) -> int:
    return int(dt.timestamp() * 1e9)

async def refresh_token(old_token: dict) -> dict:
    async with httpx.AsyncClient() as client:
        resp = await client.post("https://oauth2.googleapis.com/token", data={
            "client_id":     GOOGLE_CLIENT_ID,
            "client_secret": GOOGLE_CLIENT_SECRET,
            "refresh_token": old_token.get("refresh_token"),
            "grant_type":    "refresh_token",
        })
    if resp.status_code == 200:
        new = resp.json()
        new["refresh_token"] = old_token.get("refresh_token")
        return new
    return old_token

@router.post("/google-fit/data")
async def google_fit_data(payload: dict):
    token = payload.get("token")
    days  = int(payload.get("days", 30))

    if not token:
        raise HTTPException(status_code=400, detail="Missing token")

    access_token = token.get("access_token")
    headers      = {"Authorization": f"Bearer {access_token}"}

    end   = datetime.utcnow()
    start = end - timedelta(days=days)

    body = {
        "aggregateBy": [
            {"dataTypeName": "com.google.heart_rate.bpm"},
            {"dataTypeName": "com.google.step_count.delta"},
            {"dataTypeName": "com.google.sleep.segment"},
            {"dataTypeName": "com.google.calories.expended"},
            {"dataTypeName": "com.google.oxygen_saturation"},
        ],
        "bucketByTime": {"durationMillis": 86400000},
        "startTimeMillis": int(start.timestamp() * 1000),
        "endTimeMillis":   int(end.timestamp()   * 1000),
    }

    async with httpx.AsyncClient() as client:
        resp = await client.post(
            "https://www.googleapis.com/fitness/v1/users/me/dataset:aggregate",
            headers=headers, json=body, timeout=30
        )

    # ── Token expired — try refresh ───────────────────────────────
    if resp.status_code == 401:
        token   = await refresh_token(token)
        headers = {"Authorization": f"Bearer {token['access_token']}"}
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                "https://www.googleapis.com/fitness/v1/users/me/dataset:aggregate",
                headers=headers, json=body, timeout=30
            )

    if resp.status_code != 200:
        raise HTTPException(status_code=resp.status_code, detail="Google Fit API error")

    buckets = resp.json().get("bucket", [])

    heart_rate, steps_list, spo2_list, sleep_list, calories_list = [], [], [], [], []

    for bucket in buckets:
        date_ms  = int(bucket["startTimeMillis"])
        date_str = datetime.utcfromtimestamp(date_ms / 1000).strftime("%Y-%m-%d")

        for ds in bucket.get("dataset", []):
            dtype = ds.get("dataSourceId", "")
            pts   = ds.get("point", [])
            if not pts:
                continue
            vals = pts[0].get("value", [])
            if not vals:
                continue
            v = vals[0]

            if "heart_rate" in dtype:
                heart_rate.append({"date": date_str, "heart_rate": round(v.get("fpVal", 0), 1)})
            elif "step_count" in dtype:
                steps_list.append({"date": date_str, "steps": int(v.get("intVal", 0))})
            elif "calories" in dtype:
                calories_list.append({"date": date_str, "calories": round(v.get("fpVal", 0), 1)})
            elif "oxygen" in dtype:
                spo2_list.append({"date": date_str, "spo2": round(v.get("fpVal", 0), 1)})

    # ── Build summary ─────────────────────────────────────────────
    def avg_list(lst, key):
        vals = [x[key] for x in lst if x.get(key)]
        return round(sum(vals) / len(vals), 1) if vals else None

    summary = {
        "avg_heart_rate": avg_list(heart_rate,   "heart_rate"),
        "avg_steps":      avg_list(steps_list,    "steps"),
        "avg_spo2":       avg_list(spo2_list,     "spo2"),
        "avg_sleep":      avg_list(sleep_list,     "sleep_hours"),
        "avg_calories":   avg_list(calories_list,  "calories"),
    }

    total = sum([len(heart_rate), len(steps_list), len(spo2_list), len(sleep_list), len(calories_list)])

    return {
        "source":        "google_fit",
        "total_records": total,
        "summary":       summary,
        "token":         token,
        "data": {
            "heart_rate": heart_rate,
            "steps":      steps_list,
            "spo2":       spo2_list,
            "sleep":      sleep_list,
            "calories":   calories_list,
        }
    }
