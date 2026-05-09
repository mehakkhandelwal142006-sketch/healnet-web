"""
routes/pupil.py
FastAPI endpoint that runs pupil analysis on uploaded eye images.
Uses your existing pupil_analysis.py logic — no changes needed there.
"""
from fastapi import APIRouter, UploadFile, File, HTTPException
from services.pupil_analysis import analyze_pupil_image, analyze_both_eyes, image_to_bytes
import base64

router = APIRouter()


def _result_to_dict(result, label="") -> dict:
    """Convert PupilResult dataclass to JSON-serializable dict."""
    if result is None:
        return None

    # Convert annotated image to base64 so React can display it
    img_b64 = None
    if result.annotated_image is not None:
        img_bytes = image_to_bytes(result.annotated_image)
        img_b64 = base64.b64encode(img_bytes).decode("utf-8")

    return {
        "label":             label,
        "error":             result.error,
        "condition":         result.condition,
        "severity":          result.severity,
        "pupil_radius_px":   result.pupil_radius_px,
        "iris_radius_px":    result.iris_radius_px,
        "pupil_iris_ratio":  result.pupil_iris_ratio,
        "circularity":       result.circularity,
        "is_dilated":        result.is_dilated,
        "is_constricted":    result.is_constricted,
        "is_irregular":      result.is_irregular,
        "confidence":        result.confidence,
        "quality_grade":     result.quality_grade,
        "method":            result.method,
        "pir_std":           result.pir_std,
        "runs_succeeded":    result.runs_succeeded,
        "clinical_notes":    result.clinical_notes,
        "possible_causes":   result.possible_causes,
        "annotated_image":   img_b64,   # base64 JPEG — React renders as <img src="data:image/jpeg;base64,..."/>
    }


# ── SINGLE EYE ANALYSIS ───────────────────────────────────────────
@router.post("/analyze")
async def analyze_single(file: UploadFile = File(...)):
    """
    POST /api/pupil/analyze
    Upload one eye image → get full analysis back.
    """
    if not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image")

    image_bytes = await file.read()
    if not image_bytes:
        raise HTTPException(status_code=400, detail="Empty file")

    result = analyze_pupil_image(image_bytes)
    return _result_to_dict(result, label="Single Eye Analysis")


# ── DUAL EYE (ANISOCORIA) ANALYSIS ───────────────────────────────
@router.post("/analyze-both")
async def analyze_dual(
    left:  UploadFile = File(None),
    right: UploadFile = File(None),
):
    """
    POST /api/pupil/analyze-both
    Upload left and/or right eye images → anisocoria check + per-eye results.
    """
    left_bytes  = await left.read()  if left  else None
    right_bytes = await right.read() if right else None

    if not left_bytes and not right_bytes:
        raise HTTPException(status_code=400, detail="Provide at least one eye image")

    out = analyze_both_eyes(left_bytes, right_bytes)

    return {
        "left":                _result_to_dict(out["left"],  "Left Eye"),
        "right":               _result_to_dict(out["right"], "Right Eye"),
        "anisocoria":          out["anisocoria"],
        "anisocoria_severity": out["anisocoria_severity"],
        "anisocoria_notes":    out["anisocoria_notes"],
    }
