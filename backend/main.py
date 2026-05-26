from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routes import auth, patients, vitals, alerts, ai, pupil, smartwatch
from routes import apple_health  # ← NEW

app = FastAPI(title="HealNet API", version="2.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(auth.router,          prefix="/api/auth",          tags=["Auth"])
app.include_router(patients.router,      prefix="/api/patients",      tags=["Patients"])
app.include_router(vitals.router,        prefix="/api/vitals",        tags=["Vitals"])
app.include_router(alerts.router,        prefix="/api/alerts",        tags=["Alerts"])
app.include_router(ai.router,            prefix="/api/ai",            tags=["AI"])
app.include_router(pupil.router,         prefix="/api/pupil",         tags=["Pupil"])
app.include_router(smartwatch.router,    prefix="/api/smartwatch",    tags=["Smartwatch"])
app.include_router(apple_health.router,  prefix="/api/apple-health",  tags=["Apple Health"])  # ← NEW

@app.get("/")
def root():
    return {"message": "HealNet API v2 running ✅"}
