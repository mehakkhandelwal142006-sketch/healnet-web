"""
routes/blood_reports.py
─────────────────────────────────────────────────────────────────
POST /api/blood-reports/{patient_id}  → upload + OCR + analyze a report
GET  /api/blood-reports/{patient_id}  → get report history for a patient
DELETE /api/blood-reports/{report_id} → delete a report
"""
from fastapi import APIRouter, HTTPException, UploadFile, File
from database import supabase
from services.blood_report_ocr import analyze_report

router = APIRouter()


@router.post("/{patient_id}")
async def upload_blood_report(patient_id: str, file: UploadFile = File(...)):
    pat = supabase.table("patients").select("patient_id").eq("patient_id", patient_id).execute()
    if not pat.data:
        raise HTTPException(status_code=404, detail="Patient not found")

    file_bytes = await file.read()
    content_type = file.content_type or ""

    try:
        result = analyze_report(file_bytes, content_type)
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Could not process file: {str(e)}")

    if not result["values"]:
        raise HTTPException(
            status_code=422,
            detail="Couldn't detect any recognized test values in this report. Try a clearer image."
        )

    row = {
        "patient_id": patient_id,
        "file_name": file.filename,
        "raw_text": result["raw_text"],
        "values": result["values"],
    }
    saved = supabase.table("blood_reports").insert(row).execute()
    if not saved.data:
        raise HTTPException(status_code=500, detail="Failed to save report")

    return saved.data[0]


@router.get("/{patient_id}")
def get_blood_reports(patient_id: str):
    pat = supabase.table("patients").select("patient_id").eq("patient_id", patient_id).execute()
    if not pat.data:
        raise HTTPException(status_code=404, detail="Patient not found")

    reports = (
        supabase.table("blood_reports")
        .select("*")
        .eq("patient_id", patient_id)
        .order("uploaded_at", desc=True)
        .execute()
    )
    return reports.data or []


@router.delete("/report/{report_id}")
def delete_blood_report(report_id: str):
    result = supabase.table("blood_reports").delete().eq("id", report_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Report not found")
    return {"deleted": True}
