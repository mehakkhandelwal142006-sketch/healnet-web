"""
services/healnet_ai.py
Pure Python AI logic — no Streamlit, no UI.
Called by routes/ai.py FastAPI endpoint.
"""

from collections import defaultdict

# ── VITAL WEIGHTS ─────────────────────────────────────────────────
VITAL_WEIGHTS = {
    "Blood Pressure":   {"CRITICAL": 30, "HIGH": 20, "MODERATE": 10, "LOW": 5,  "NORMAL": 0},
    "Heart Rate":       {"CRITICAL": 25, "HIGH": 18, "MODERATE":  8, "LOW": 4,  "NORMAL": 0},
    "SpO2":             {"CRITICAL": 30, "HIGH": 22, "MODERATE": 12, "LOW": 5,  "NORMAL": 0},
    "Blood Sugar":      {"CRITICAL": 20, "HIGH": 14, "MODERATE":  7, "LOW": 3,  "NORMAL": 0},
    "Temperature":      {"CRITICAL": 20, "HIGH": 14, "MODERATE":  6, "LOW": 3,  "NORMAL": 0},
    "Respiratory Rate": {"CRITICAL": 20, "HIGH": 14, "MODERATE":  6, "LOW": 3,  "NORMAL": 0},
    "BMI":              {"CRITICAL": 10, "HIGH":  7, "MODERATE":  3, "LOW": 2,  "NORMAL": 0},
}

MAX_RAW_SCORE = sum(w["CRITICAL"] for w in VITAL_WEIGHTS.values())  # 155

# ── THRESHOLDS — converts raw vitals → levels ─────────────────────
def classify_vitals(vitals: dict) -> dict:
    """
    Input:  raw vitals dict from DB
            { heart_rate: 95, spo2: 97, systolic_bp: 145, ... }
    Output: vitals_map used by AI engine
            { "Heart Rate": ("95 bpm", "HIGH", "Elevated HR") }
    """
    vm = {}

    hr = vitals.get("heart_rate")
    if hr is not None:
        if hr > 120 or hr < 40:   level = "CRITICAL"
        elif hr > 100 or hr < 55: level = "HIGH"
        elif hr > 90  or hr < 60: level = "MODERATE"
        else:                     level = "NORMAL"
        vm["Heart Rate"] = (f"{hr} bpm", level, f"Heart rate {hr} bpm")

    spo2 = vitals.get("spo2")
    if spo2 is not None:
        if spo2 < 90:   level = "CRITICAL"
        elif spo2 < 94: level = "HIGH"
        elif spo2 < 96: level = "MODERATE"
        else:           level = "NORMAL"
        vm["SpO2"] = (f"{spo2}%", level, f"SpO2 {spo2}%")

    sbp = vitals.get("systolic_bp")
    dbp = vitals.get("diastolic_bp")
    if sbp is not None:
        if sbp > 180 or sbp < 80:   level = "CRITICAL"
        elif sbp > 140 or sbp < 90: level = "HIGH"
        elif sbp > 130:             level = "MODERATE"
        else:                       level = "NORMAL"
        label = f"{sbp}/{dbp} mmHg" if dbp else f"{sbp} mmHg"
        vm["Blood Pressure"] = (label, level, f"BP {label}")

    temp = vitals.get("temperature")
    if temp is not None:
        if temp > 40 or temp < 34:     level = "CRITICAL"
        elif temp > 38.5 or temp < 35: level = "HIGH"
        elif temp > 37.5:              level = "MODERATE"
        else:                          level = "NORMAL"
        vm["Temperature"] = (f"{temp}°C", level, f"Temp {temp}°C")

    bs = vitals.get("blood_sugar")
    if bs is not None:
        if bs > 300 or bs < 50:    level = "CRITICAL"
        elif bs > 180 or bs < 70:  level = "HIGH"
        elif bs > 140:             level = "MODERATE"
        else:                      level = "NORMAL"
        vm["Blood Sugar"] = (f"{bs} mg/dL", level, f"Blood sugar {bs}")

    rr = vitals.get("respiratory_rate")
    if rr is not None:
        if rr > 30 or rr < 8:    level = "CRITICAL"
        elif rr > 24 or rr < 12: level = "HIGH"
        elif rr > 20:            level = "MODERATE"
        else:                    level = "NORMAL"
        vm["Respiratory Rate"] = (f"{rr} /min", level, f"RR {rr}/min")

    bmi = vitals.get("bmi")
    if bmi is not None:
        if bmi > 40 or bmi < 15:  level = "CRITICAL"
        elif bmi > 30 or bmi < 17:level = "HIGH"
        elif bmi > 25:            level = "MODERATE"
        else:                     level = "NORMAL"
        vm["BMI"] = (f"{bmi}", level, f"BMI {bmi}")

    return vm


def _level(vitals_map: dict, vital_name: str) -> str:
    entry = vitals_map.get(vital_name)
    return entry[1] if entry else "NORMAL"


# ── RECOMMENDATIONS ───────────────────────────────────────────────
RECOMMENDATIONS = [
    (lambda v: _level(v, "SpO2") in ("CRITICAL", "HIGH"),
     "🆘", "SpO2 critically low — administer supplemental oxygen immediately."),

    (lambda v: _level(v, "Blood Pressure") == "CRITICAL",
     "🚨", "Blood pressure dangerously high — risk of stroke. Seek emergency care NOW."),

    (lambda v: _level(v, "Heart Rate") == "CRITICAL",
     "🚨", "Severe arrhythmia detected — immediate cardiac evaluation needed."),

    (lambda v: _level(v, "Blood Pressure") == "HIGH",
     "🔴", "Stage 2 hypertension — consult a physician. Reduce sodium intake."),

    (lambda v: _level(v, "Heart Rate") == "HIGH",
     "🔴", "Tachycardia/Bradycardia detected — avoid stimulants, rest, see cardiologist."),

    (lambda v: _level(v, "Blood Sugar") in ("CRITICAL", "HIGH"),
     "🔴", "Blood sugar elevated — check for diabetes. Reduce sugar and consult physician."),

    (lambda v: _level(v, "Temperature") in ("CRITICAL", "HIGH"),
     "🔴", "High fever — check for infection or heat stroke. Hydrate and seek care."),

    (lambda v: _level(v, "Respiratory Rate") in ("CRITICAL", "HIGH"),
     "🔴", "Abnormal respiratory rate — may indicate respiratory distress."),

    (lambda v: _level(v, "BMI") == "CRITICAL",
     "🟡", "BMI indicates severe obesity — recommend dietary assessment and exercise."),

    (lambda v: all(_level(v, k) == "NORMAL" for k in VITAL_WEIGHTS),
     "✅", "All vitals normal — continue regular check-ups and healthy lifestyle."),

    (lambda v: True,
     "🟡", "Some vitals need attention — consult your physician soon."),
]


# ── MAIN AI ENGINE ────────────────────────────────────────────────
class HealNetAI:
    def __init__(self, patient_id: str, vitals_map: dict, alert_log: list):
        self.pid        = patient_id
        self.vitals     = vitals_map
        self.alert_log  = [e for e in alert_log if e.get("patient_id") == patient_id]
        self.risk_score = self._compute_risk()
        self.risk_label, self.risk_color = self._risk_label()
        self.trends     = self._detect_trends()
        self.recs       = self._get_recommendations()

    def _compute_risk(self) -> int:
        raw = 0
        for vital, weights in VITAL_WEIGHTS.items():
            level = _level(self.vitals, vital)
            raw  += weights.get(level, 0)
        return min(100, round((raw / MAX_RAW_SCORE) * 100))

    def _risk_label(self):
        s = self.risk_score
        if s >= 70: return "CRITICAL RISK",  "#b01030"
        if s >= 45: return "HIGH RISK",       "#b07800"
        if s >= 20: return "MODERATE RISK",   "#cc8800"
        return       "LOW RISK",              "#007040"

    def _detect_trends(self) -> list:
        recent   = self.alert_log[:20]
        counts   = defaultdict(int)
        cat_seen = defaultdict(set)
        for entry in recent:
            v = entry.get("vital", "")
            c = entry.get("category", "")
            counts[v] += 1
            cat_seen[v].add(c)

        trends = []
        for vital, count in counts.items():
            cats = cat_seen[vital]
            if count >= 3 and "Critical" in cats:
                trends.append({
                    "vital": vital, "trend": "Worsening", "count": count,
                    "note": f"Flagged Critical {count}× in recent history.",
                    "color": "#b01030"
                })
            elif count >= 2 and "Warning" in cats and "Critical" not in cats:
                trends.append({
                    "vital": vital, "trend": "Watch", "count": count,
                    "note": f"Flagged {count}× as Warning — monitor closely.",
                    "color": "#b07800"
                })
        return trends

    def _get_recommendations(self) -> list:
        results = []
        for condition, icon, msg in RECOMMENDATIONS:
            try:
                if condition(self.vitals):
                    results.append({"icon": icon, "message": msg})
                    if icon == "🆘":
                        break
            except Exception:
                continue
        return results[:4]

    def to_dict(self) -> dict:
        """Return full AI result as JSON-serializable dict."""
        breakdown = []
        for vital, weights in VITAL_WEIGHTS.items():
            level = _level(self.vitals, vital)
            score = weights.get(level, 0)
            max_s = weights["CRITICAL"]
            breakdown.append({
                "vital": vital,
                "level": level,
                "score": score,
                "max_score": max_s,
                "pct": round((score / max_s) * 100) if max_s else 0
            })
        return {
            "patient_id":   self.pid,
            "risk_score":   self.risk_score,
            "risk_label":   self.risk_label,
            "risk_color":   self.risk_color,
            "vitals_count": len(self.vitals),
            "alerts_count": len(self.alert_log),
            "trends":       self.trends,
            "recommendations": self.recs,
            "breakdown":    breakdown,
            "vitals_map":   {k: {"value": v[0], "level": v[1], "message": v[2]}
                             for k, v in self.vitals.items()},
        }
