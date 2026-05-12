from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from database import supabase

router = APIRouter()


class VitalCreate(BaseModel):
    patient_id:       str
    source:           Optional[str]   = "manual"
    device_id:        Optional[str]   = None
    heart_rate:       Optional[float] = None
    spo2:             Optional[float] = None
    systolic_bp:      Optional[float] = None
    diastolic_bp:     Optional[float] = None
    temperature:      Optional[float] = None
    blood_sugar:      Optional[float] = None
    respiratory_rate: Optional[float] = None
    bmi:              Optional[float] = None


@router.get("/{patient_id}")
def get_vitals(patient_id: str, limit: int = 20):
    result = (
        supabase.table("vitals_readings")
        .select("*")
        .eq("patient_id", patient_id)
        .order("recorded_at", desc=True)
        .limit(limit)
        .execute()
    )
    return result.data


@router.get("/{patient_id}/latest")
def get_latest_vital(patient_id: str):
    result = (
        supabase.table("vitals_readings")
        .select("*")
        .eq("patient_id", patient_id)
        .order("recorded_at", desc=True)
        .limit(1)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="No vitals found")
    return result.data[0]


@router.post("/")
def record_vital(body: VitalCreate):
    pat = (
        supabase.table("patients")
        .select("patient_id")
        .eq("patient_id", body.patient_id)
        .execute()
    )
    if not pat.data:
        raise HTTPException(status_code=404, detail="Patient not found")

    result = supabase.table("vitals_readings").insert(body.dict()).execute()
    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to save vitals")

    vital = result.data[0]
    alerts = check_alerts(body)
    for alert in alerts:
        alert["patient_id"] = body.patient_id
        supabase.table("alert_log").insert(alert).execute()

    return {"vital": vital, "alerts_generated": len(alerts)}


def check_alerts(v: VitalCreate) -> list:
    alerts = []

    def add(vital, value, level, category, message):
        alerts.append({
            "vital": vital, "value": str(value),
            "level": level, "category": category, "message": message
        })

    if v.heart_rate is not None:
        if v.heart_rate > 120 or v.heart_rate < 40:
            add("heart_rate", v.heart_rate, "danger", "Critical", f"Heart rate {v.heart_rate} bpm is critically abnormal!")
        elif v.heart_rate > 100 or v.heart_rate < 55:
            add("heart_rate", v.heart_rate, "warning", "Warning", f"Heart rate {v.heart_rate} bpm needs attention.")

    if v.spo2 is not None:
        if v.spo2 < 90:
            add("spo2", v.spo2, "danger", "Critical", f"SpO2 {v.spo2}% is dangerously low!")
        elif v.spo2 < 95:
            add("spo2", v.spo2, "warning", "Warning", f"SpO2 {v.spo2}% is below normal.")

    if v.systolic_bp is not None:
        if v.systolic_bp > 180 or v.systolic_bp < 80:
            add("systolic_bp", v.systolic_bp, "danger", "Critical", f"BP {v.systolic_bp} mmHg is critically abnormal!")
        elif v.systolic_bp > 140 or v.systolic_bp < 90:
            add("systolic_bp", v.systolic_bp, "warning", "Warning", f"BP {v.systolic_bp} mmHg needs attention.")

    if v.temperature is not None:
        if v.temperature > 40 or v.temperature < 35:
            add("temperature", v.temperature, "danger", "Critical", f"Temperature {v.temperature}°C is critically abnormal!")
        elif v.temperature > 38.5 or v.temperature < 36:
            add("temperature", v.temperature, "warning", "Warning", f"Temperature {v.temperature}°C is abnormal.")

    if v.blood_sugar is not None:
        if v.blood_sugar > 300 or v.blood_sugar < 50:
            add("blood_sugar", v.blood_sugar, "danger", "Critical", f"Blood sugar {v.blood_sugar} mg/dL is critically abnormal!")
        elif v.blood_sugar > 180 or v.blood_sugar < 70:
            add("blood_sugar", v.blood_sugar, "warning", "Warning", f"Blood sugar {v.blood_sugar} mg/dL needs attention.")

    return alerts
