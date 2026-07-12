"""
services/blood_report_ocr.py
─────────────────────────────────────────────────────────────────
Blood Report Analyzer — OCR + rule-based interpretation.

Extracts text from an uploaded image or PDF (first page) using
Tesseract OCR, then matches lines against a dictionary of common
blood test names to flag values outside normal reference ranges.

No external AI/paid APIs - purely rule-based, same philosophy as
health_score_engine.py and smart_alerts.py.
─────────────────────────────────────────────────────────────────
"""
import io
import re
from typing import Optional

import pytesseract
from PIL import Image
from pdf2image import convert_from_bytes

# ════════════════════════════════════════════════════════════════════
#  REFERENCE RANGES — same dictionary as the frontend's referenceRanges.js
# ════════════════════════════════════════════════════════════════════
REFERENCE_RANGES = [
    {"key": "hemoglobin",    "label": "Hemoglobin",         "aliases": ["hemoglobin", "hgb", "hb"],                          "unit": "g/dL",    "low": 13.0,    "high": 17.0},
    {"key": "rbc",           "label": "RBC Count",          "aliases": ["rbc count", "red blood cell", "rbc"],               "unit": "mill/µL", "low": 4.5,     "high": 5.9},
    {"key": "wbc",           "label": "WBC Count",          "aliases": ["wbc count", "white blood cell", "wbc", "total leucocyte"], "unit": "/µL", "low": 4000,  "high": 11000},
    {"key": "platelets",     "label": "Platelet Count",     "aliases": ["platelet count", "platelets", "plt"],               "unit": "/µL",     "low": 150000, "high": 410000},
    {"key": "hematocrit",    "label": "Hematocrit",         "aliases": ["hematocrit", "hct", "pcv"],                         "unit": "%",       "low": 38.8,    "high": 50.0},
    {"key": "glucose",       "label": "Fasting Blood Sugar","aliases": ["fasting blood sugar", "fasting glucose", "blood glucose", "glucose fasting", "fbs"], "unit": "mg/dL", "low": 70, "high": 100},
    {"key": "cholesterol",   "label": "Total Cholesterol",  "aliases": ["total cholesterol", "cholesterol total", "cholesterol"], "unit": "mg/dL", "low": 0,   "high": 200},
    {"key": "hdl",           "label": "HDL Cholesterol",    "aliases": ["hdl cholesterol", "hdl"],                           "unit": "mg/dL",   "low": 40,      "high": 60},
    {"key": "ldl",           "label": "LDL Cholesterol",    "aliases": ["ldl cholesterol", "ldl"],                           "unit": "mg/dL",   "low": 0,       "high": 100},
    {"key": "triglycerides", "label": "Triglycerides",      "aliases": ["triglycerides"],                                   "unit": "mg/dL",   "low": 0,       "high": 150},
    {"key": "creatinine",    "label": "Creatinine",         "aliases": ["creatinine", "serum creatinine"],                   "unit": "mg/dL",   "low": 0.6,     "high": 1.3},
    {"key": "urea",          "label": "Blood Urea",         "aliases": ["blood urea", "urea"],                               "unit": "mg/dL",   "low": 15,      "high": 45},
    {"key": "sgpt",          "label": "SGPT/ALT",           "aliases": ["sgpt", "alt", "alanine aminotransferase"],          "unit": "U/L",     "low": 7,       "high": 56},
    {"key": "sgot",          "label": "SGOT/AST",           "aliases": ["sgot", "ast", "aspartate aminotransferase"],        "unit": "U/L",     "low": 8,       "high": 48},
    {"key": "tsh",           "label": "TSH",                "aliases": ["tsh", "thyroid stimulating hormone"],               "unit": "mIU/L",   "low": 0.4,     "high": 4.0},
    {"key": "vitamind",      "label": "Vitamin D",          "aliases": ["vitamin d", "25-oh vitamin d", "vit d"],            "unit": "ng/mL",   "low": 30,      "high": 100},
    {"key": "vitaminb12",    "label": "Vitamin B12",        "aliases": ["vitamin b12", "vit b12", "cobalamin"],              "unit": "pg/mL",   "low": 200,     "high": 900},
    {"key": "calcium",       "label": "Calcium",            "aliases": ["calcium", "serum calcium"],                         "unit": "mg/dL",   "low": 8.5,     "high": 10.5},
    {"key": "sodium",        "label": "Sodium",             "aliases": ["sodium", "na+"],                                    "unit": "mEq/L",   "low": 135,     "high": 145},
    {"key": "potassium",     "label": "Potassium",          "aliases": ["potassium", "k+"],                                  "unit": "mEq/L",   "low": 3.5,     "high": 5.1},
]


def _find_matching_test(line: str) -> Optional[dict]:
    lower = line.lower()
    best = None
    best_alias_len = 0
    for test in REFERENCE_RANGES:
        for alias in test["aliases"]:
            if alias in lower and len(alias) > best_alias_len:
                best = test
                best_alias_len = len(alias)
    return best


def _extract_number(line: str) -> Optional[float]:
    match = re.search(r"(\d+\.?\d*)", line)
    return float(match.group(1)) if match else None


def _status_for(value: float, test: dict) -> str:
    if value < test["low"]:
        return "low"
    if value > test["high"]:
        return "high"
    return "normal"


def parse_report_text(raw_text: str) -> list[dict]:
    """Parses OCR'd text into a list of {key,label,value,unit,status,low,high}."""
    lines = [l.strip() for l in raw_text.split("\n") if l.strip()]
    found = []
    seen_keys = set()

    for line in lines:
        test = _find_matching_test(line)
        if not test or test["key"] in seen_keys:
            continue
        value = _extract_number(line)
        if value is None:
            continue
        seen_keys.add(test["key"])
        found.append({
            "key": test["key"],
            "label": test["label"],
            "value": value,
            "unit": test["unit"],
            "low": test["low"],
            "high": test["high"],
            "status": _status_for(value, test),
        })
    return found


# ════════════════════════════════════════════════════════════════════
#  OCR — image and PDF handling
# ════════════════════════════════════════════════════════════════════
def ocr_image_bytes(image_bytes: bytes) -> str:
    image = Image.open(io.BytesIO(image_bytes))
    return pytesseract.image_to_string(image)


def ocr_pdf_bytes(pdf_bytes: bytes) -> str:
    """OCRs the first page of a PDF."""
    pages = convert_from_bytes(pdf_bytes, first_page=1, last_page=1, dpi=200)
    if not pages:
        return ""
    return pytesseract.image_to_string(pages[0])


def analyze_report(file_bytes: bytes, content_type: str) -> dict:
    """Main entry point: OCR + parse. Returns {raw_text, values}."""
    if content_type == "application/pdf":
        raw_text = ocr_pdf_bytes(file_bytes)
    else:
        raw_text = ocr_image_bytes(file_bytes)

    values = parse_report_text(raw_text)
    return {"raw_text": raw_text, "values": values}
