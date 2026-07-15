import { useState } from "react";
import { vitalsAPI, bloodReportsAPI, smartAlertsAPI } from "../services/api";

const C = {
  bg: "#030c2c", card: "#04163c", border: "rgba(59,201,232,0.18)",
  accent: "#3BC9E8", accent2: "#00f5a0", danger: "#ff4d6d",
  warn: "#ffd166", text: "#e8f4f8", muted: "rgba(232,244,248,0.5)",
};

const RISK_STYLE = {
  high:     { color: C.danger,  label: "High Risk",     icon: "🔴" },
  moderate: { color: C.warn,    label: "Moderate Risk", icon: "🟠" },
  low:      { color: C.accent2, label: "Low Risk",       icon: "🟢" },
  unknown:  { color: C.muted,   label: "Not Enough Data", icon: "⚪" },
};

function avg(nums) {
  const valid = nums.filter(n => n !== null && n !== undefined && !isNaN(n));
  if (valid.length === 0) return null;
  return valid.reduce((a, b) => a + b, 0) / valid.length;
}

// ── Rule-based risk calculators ─────────────────────────────────────
// All computation happens on-device from data already fetched - no
// external AI, no paid APIs. Same rule-based philosophy as the app's
// existing Health Score and Smart Alerts engines.

function calcHypertensionRisk(vitals) {
  const recent = vitals.slice(0, 10);
  const avgSystolic = avg(recent.map(v => v.systolic_bp));
  const avgDiastolic = avg(recent.map(v => v.diastolic_bp));

  if (avgSystolic === null && avgDiastolic === null) {
    return { level: "unknown", reason: "No blood pressure readings recorded yet." };
  }

  const sys = avgSystolic || 0;
  const dia = avgDiastolic || 0;

  if (sys >= 140 || dia >= 90) {
    return {
      level: "high",
      reason: `Average BP of ${sys.toFixed(0)}/${dia.toFixed(0)} mmHg over recent readings is in the high blood pressure range (≥140/90).`,
    };
  }
  if (sys >= 130 || dia >= 80) {
    return {
      level: "moderate",
      reason: `Average BP of ${sys.toFixed(0)}/${dia.toFixed(0)} mmHg is elevated (130-139/80-89), above the ideal range.`,
    };
  }
  return {
    level: "low",
    reason: `Average BP of ${sys.toFixed(0)}/${dia.toFixed(0)} mmHg is within the normal range.`,
  };
}

function calcDiabetesRisk(vitals, latestBloodReport) {
  // Prefer lab-tested Fasting Blood Sugar from a blood report if available,
  // otherwise fall back to vitals-recorded blood_sugar readings.
  const labFbs = latestBloodReport?.values?.find(v => v.key === "glucose");
  const vitalsSugar = avg(vitals.slice(0, 10).map(v => v.blood_sugar));

  const value = labFbs ? labFbs.value : vitalsSugar;
  const source = labFbs ? "fasting blood sugar (lab report)" : "recent blood sugar readings";

  if (value === null || value === undefined) {
    return { level: "unknown", reason: "No blood sugar data recorded yet (neither vitals nor a blood report)." };
  }

  if (value >= 126) {
    return { level: "high", reason: `${source} of ${value} mg/dL is in the diabetic range (≥126 mg/dL fasting).` };
  }
  if (value >= 100) {
    return { level: "moderate", reason: `${source} of ${value} mg/dL is in the prediabetic range (100-125 mg/dL fasting).` };
  }
  return { level: "low", reason: `${source} of ${value} mg/dL is within the normal range.` };
}

function calcCardiovascularRisk(hypertensionLevel, latestBloodReport, smartAlerts, patient) {
  let factors = [];

  if (hypertensionLevel === "high") factors.push("high blood pressure");
  else if (hypertensionLevel === "moderate") factors.push("elevated blood pressure");

  const chol = latestBloodReport?.values?.find(v => v.key === "cholesterol");
  const ldl = latestBloodReport?.values?.find(v => v.key === "ldl");
  if (chol && chol.status === "high") factors.push("high total cholesterol");
  if (ldl && ldl.status === "high") factors.push("high LDL cholesterol");

  const hrAlert = smartAlerts?.find(a => a.metric === "resting_hr");
  if (hrAlert) factors.push("rising resting heart rate trend");

  if (patient?.age && patient.age >= 45) factors.push("age 45+");

  if (chol === undefined && ldl === undefined && hypertensionLevel === "unknown" && !hrAlert && (!patient?.age || patient.age < 45)) {
    return { level: "unknown", reason: "Not enough data yet — needs blood pressure history and/or a blood report with cholesterol values.", factors: [] };
  }

  if (factors.length >= 3) return { level: "high", reason: `Multiple risk factors present: ${factors.join(", ")}.`, factors };
  if (factors.length >= 1) return { level: "moderate", reason: `Some risk factors present: ${factors.join(", ")}.`, factors };
  return { level: "low", reason: "No significant cardiovascular risk factors detected in available data.", factors: [] };
}

function calcSleepDisorderRisk(smartAlerts) {
  const sleepAlert = smartAlerts?.find(a => a.metric === "sleep");
  if (!sleepAlert) {
    return { level: "unknown", reason: "No wearable sleep data available yet. Sync a smartwatch to enable this prediction." };
  }
  const sevMap = { high: "high", moderate: "moderate", mild: "moderate" };
  return {
    level: sevMap[sleepAlert.severity] || "moderate",
    reason: sleepAlert.message || `Sleep duration has been declining for ${sleepAlert.streak_days} consecutive days.`,
  };
}

// ── UI ────────────────────────────────────────────────────────────
function RiskCard({ title, icon, risk }) {
  const style = RISK_STYLE[risk.level];
  return (
    <div style={{
      background: style.color + "12", border: `1px solid ${style.color}44`,
      borderLeft: `4px solid ${style.color}`, borderRadius: 12,
      padding: "14px 16px", marginBottom: 12,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{icon} {title}</span>
        <span style={{
          background: style.color + "22", color: style.color,
          border: `1px solid ${style.color}44`, borderRadius: 6,
          padding: "2px 8px", fontSize: 11, fontWeight: 700,
        }}>
          {style.icon} {style.label}
        </span>
      </div>
      <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.5 }}>{risk.reason}</div>
    </div>
  );
}

export default function RiskPredictionPage({ patients }) {
  const [selPatient, setSelPatient] = useState("");
  const [risks, setRisks] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function loadRisks(patientId) {
    if (!patientId) return;
    setLoading(true); setError(""); setRisks(null);
    try {
      const patient = (patients || []).find(p => p.patient_id === patientId);

      const [vRes, bRes, sRes] = await Promise.allSettled([
        vitalsAPI.getForPatient(patientId, 30),
        bloodReportsAPI.getForPatient(patientId),
        smartAlertsAPI.getForPatient(patientId),
      ]);

      const vitals = vRes.status === "fulfilled" ? (vRes.value.data || []) : [];
      const bloodReports = bRes.status === "fulfilled" ? (bRes.value.data || []) : [];
      const latestBloodReport = bloodReports[0] || null;
      const smartAlerts = sRes.status === "fulfilled" ? (sRes.value.data?.alerts || []) : [];

      const hypertension = calcHypertensionRisk(vitals);
      const diabetes = calcDiabetesRisk(vitals, latestBloodReport);
      const cardiovascular = calcCardiovascularRisk(hypertension.level, latestBloodReport, smartAlerts, patient);
      const sleepDisorder = calcSleepDisorderRisk(smartAlerts);

      setRisks({ hypertension, diabetes, cardiovascular, sleepDisorder });
    } catch (e) {
      setError("Could not calculate risk predictions for this patient.");
    }
    setLoading(false);
  }

  function handlePatientChange(e) {
    setSelPatient(e.target.value);
    loadRisks(e.target.value);
  }

  const selectStyle = {
    padding: "10px 16px", borderRadius: 10,
    background: "rgba(59,201,232,0.07)", border: `1px solid ${C.border}`,
    color: C.text, fontSize: 14, outline: "none",
    boxSizing: "border-box", fontFamily: "inherit",
  };

  const highCount = risks ? Object.values(risks).filter(r => r.level === "high").length : 0;
  const moderateCount = risks ? Object.values(risks).filter(r => r.level === "moderate").length : 0;

  return (
    <div style={{ fontFamily: "'Segoe UI', sans-serif", color: C.text }}>
      <h2 style={{ margin: "0 0 6px", fontSize: 22 }}>🧬 Risk Prediction</h2>
      <p style={{ color: C.muted, fontSize: 14, marginBottom: 20 }}>
        On-device, rule-based prediction of health risks using vitals history, blood reports, and trend data — no external AI.
      </p>

      <select value={selPatient} onChange={handlePatientChange}
        style={{ ...selectStyle, width: "100%", marginBottom: 20 }}>
        <option value="">— Select a patient —</option>
        {(patients || []).map(p => (
          <option key={p.patient_id} value={p.patient_id}>{p.name} ({p.patient_id})</option>
        ))}
      </select>

      {loading && (
        <div style={{ textAlign: "center", padding: 60 }}>
          <div style={{ fontSize: 36, marginBottom: 16 }}>🧬</div>
          <div style={{ color: C.accent, fontSize: 15 }}>Calculating risk predictions...</div>
        </div>
      )}

      {error && (
        <div style={{ color: C.danger, padding: 16, background: "rgba(255,77,109,0.1)", borderRadius: 10, marginBottom: 16 }}>
          ⚠️ {error}
        </div>
      )}

      {!selPatient && !loading && (
        <div style={{ color: C.muted, textAlign: "center", padding: 60 }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🧬</div>
          <div style={{ fontSize: 15 }}>Select a patient to view their risk predictions</div>
        </div>
      )}

      {risks && !loading && (
        <>
          {(highCount > 0 || moderateCount > 0) && (
            <div style={{
              background: highCount > 0 ? C.danger + "12" : C.warn + "12",
              border: `1px solid ${(highCount > 0 ? C.danger : C.warn)}44`,
              borderRadius: 16, padding: 16, marginBottom: 20,
            }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: highCount > 0 ? C.danger : C.warn }}>
                {highCount > 0
                  ? `${highCount} high-risk area${highCount > 1 ? "s" : ""} detected`
                  : `${moderateCount} area${moderateCount > 1 ? "s" : ""} showing moderate risk`}
              </div>
            </div>
          )}

          <RiskCard title="Hypertension Risk"     icon="🩸" risk={risks.hypertension} />
          <RiskCard title="Diabetes Risk"          icon="🍬" risk={risks.diabetes} />
          <RiskCard title="Cardiovascular Risk"    icon="❤️" risk={risks.cardiovascular} />
          <RiskCard title="Sleep Disorder Risk"    icon="😴" risk={risks.sleepDisorder} />

          <button onClick={() => loadRisks(selPatient)}
            style={{
              width: "100%", marginTop: 12, padding: "12px",
              borderRadius: 10, border: `1px solid ${C.border}`,
              background: "none", color: C.muted,
              cursor: "pointer", fontSize: 14,
            }}>
            ↻ Recalculate
          </button>
        </>
      )}
    </div>
  );
}