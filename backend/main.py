from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routes import auth, patients, vitals, alerts, ai, pupil   # ← ai + pupil added

app = FastAPI(title="HealNet API", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "https://your-app.vercel.app"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router,     prefix="/api/auth",     tags=["Auth"])
app.include_router(patients.router, prefix="/api/patients", tags=["Patients"])
app.include_router(vitals.router,   prefix="/api/vitals",   tags=["Vitals"])
app.include_router(alerts.router,   prefix="/api/alerts",   tags=["Alerts"])
app.include_router(ai.router,       prefix="/api/ai",       tags=["AI"])        # ← NEW
app.include_router(pupil.router,    prefix="/api/pupil",    tags=["Pupil"])     # ← NEW

@app.get("/")
def root():
    return {"message": "HealNet API v2 running ✅"}
