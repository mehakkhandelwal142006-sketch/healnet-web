"""
apple_health_webhook.py — Webhook receiver for Health Auto Export.

Run alongside your Streamlit app:
    uvicorn apple_health_webhook:app --port 8502

Then in Health Auto Export on iPhone:
    Automation → Webhooks → Add URL → http://YOUR_IP:8502/apple_health?user_id=USER_ID

For local dev use ngrok:
    ngrok http 8502
    → copy the https URL into Health Auto Export
"""

from fastapi import FastAPI, Request, HTTPException, Query
from fastapi.responses import JSONResponse
from apple_health import parse_and_store

app = FastAPI(title="HealNet — Apple Health Webhook")


@app.post("/apple_health")
async def receive_health_data(
    request: Request,
    user_id: str = Query(..., description="HealNet user ID"),
):
    """
    Health Auto Export POSTs JSON here every time it syncs.
    The user_id query param ties the data to the right Supabase user.
    """
    if not user_id:
        raise HTTPException(status_code=400, detail="user_id is required")

    try:
        payload = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON payload")

    try:
        summary = parse_and_store(payload, user_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    return JSONResponse({
        "status":  "ok",
        "user_id": user_id,
        "stored":  summary,
    })


@app.get("/health")
async def health_check():
    return {"status": "running"}
