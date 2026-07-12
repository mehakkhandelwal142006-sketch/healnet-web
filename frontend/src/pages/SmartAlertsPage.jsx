import { useState } from "react";
import { smartAlertsAPI } from "../services/api";

const C = {
  bg: "#030c2c", card: "#04163c", border: "rgba(59,201,232,0.18)",
  accent: "#3BC9E8", accent2: "#00f5a0", danger: "#ff4d6d",
  warn: "#ffd166", text: "#e8f4f8", muted: "rgba(232,244,248,0.5)",
};

// Matches backend severities exactly: high / moderate / mild
const SEVERITY_STYLE = {
  high:     { color: C.danger,  icon: "🚨", label: "High" },
  moderate: { color: "#f97316", icon: "⚠️", label: "Moderate" },
  mild:     { color: C.warn,    icon: "👀", label: "Mild" },
};

function severityStyle(sev) {
  return SEVERITY_STYLE[sev] || { color: C.accent, icon: "•", label: sev || "Unknown" };
}

const METRIC_ICONS = {
  resting_hr: "💓",
  stress:     "🧠",
  sleep:      "😴",
  activity:   "🚶",
};

export default function SmartAlertsPage({ patients }) {
  const [selPatient, setSelPatient] = useState("");
  const [result, setResult]         = useState(null); // full backend response
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState("");

  async function loadAlerts(patientId) {
    if (!patientId) return;
    setLoading(true); setError(""); setResult(null);
    try {
      const res = await smartAlertsAPI.getForPatient(patientId);
      setResult(res.data);
    } catch (e) {
      setError(e.response?.data?.detail || "Could not load smart alerts");
    }
    setLoading(false);
  }

  function handlePatientChange(e) {
    setSelPatient(e.target.value);
    loadAlerts(e.target.value);
  }

  const selectStyle = {
    padding: "10px 16px", borderRadius: 10,
    background: "rgba(59,201,232,0.07)", border: `1px solid ${C.border}`,
    color: C.text, fontSize: 14, outline: "none",
    boxSizing: "border-box", fontFamily: "inherit",
  };

  const alerts = result?.alerts || [];

  return (
    <div style={{ fontFamily: "'Segoe UI', sans-serif", color: C.text }}>
      <h2 style={{ margin: "0 0 6px", fontSize: 22 }}>🧠 Smart Health Alerts</h2>
      <p style={{ color: C.muted, fontSize: 14, marginBottom: 20 }}>
        Detects gradual health deterioration — 3+ consecutive days trending the wrong way in resting heart rate, stress, sleep, or activity.
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
          <div style={{ fontSize: 36, marginBottom: 16 }}>🧠</div>
          <div style={{ color: C.accent, fontSize: 15 }}>Checking for trends...</div>
        </div>
      )}

      {error && (
        <div style={{ color: C.danger, padding: 16, background: "rgba(255,77,109,0.1)", borderRadius: 10, marginBottom: 16 }}>
          ⚠️ {error}
        </div>
      )}

      {!selPatient && !loading && (
        <div style={{ color: C.muted, textAlign: "center", padding: 60 }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🧠</div>
          <div style={{ fontSize: 15 }}>Select a patient to check for trending risks</div>
        </div>
      )}

      {result !== null && !loading && (
        <>
          {/* ── No data at all recorded for this patient ── */}
          {!result.has_data ? (
            <div style={{
              background: C.card, border: `1px solid ${C.border}`,
              borderRadius: 16, padding: 40, textAlign: "center",
            }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>📭</div>
              <div style={{ color: C.text, fontSize: 15, fontWeight: 600, marginBottom: 8 }}>
                No health data recorded yet
              </div>
              <div style={{ color: C.muted, fontSize: 13, lineHeight: 1.6 }}>
                This patient has no vitals or wearable history for any of the tracked metrics
                (resting heart rate, stress, sleep, activity). Record some data first.
              </div>
            </div>
          ) : alerts.length === 0 ? (
            /* ── Data exists, but not enough consistent history for a trend yet ── */
            <div style={{
              background: C.accent2 + "12", border: `1px solid ${C.accent2}44`,
              borderRadius: 16, padding: 30, textAlign: "center",
            }}>
              <div style={{ fontSize: 32, marginBottom: 10 }}>✅</div>
              <div style={{ color: C.accent2, fontSize: 15, fontWeight: 700 }}>
                No concerning trends right now
              </div>
            </div>
          ) : (
            /* ── Real trend(s) detected ── */
            alerts.map((a, i) => {
              const style = severityStyle(a.severity);
              return (
                <div key={i} style={{
                  background: style.color + "12", border: `1px solid ${style.color}44`,
                  borderLeft: `4px solid ${style.color}`, borderRadius: 12,
                  padding: "14px 16px", marginBottom: 12,
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: C.text }}>
                      {METRIC_ICONS[a.metric] || "📈"} {a.label}
                    </span>
                    <span style={{
                      background: style.color + "22", color: style.color,
                      border: `1px solid ${style.color}44`, borderRadius: 6,
                      padding: "2px 8px", fontSize: 11, fontWeight: 700,
                    }}>
                      {style.icon} {style.label}
                    </span>
                  </div>
                  <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.5, marginBottom: 10 }}>
                    {a.message}
                  </div>
                  <div style={{ display: "flex", gap: 12 }}>
                    <div style={{ background: "rgba(255,255,255,0.05)", borderRadius: 8, padding: "6px 12px", textAlign: "center", flex: 1 }}>
                      <div style={{ fontSize: 10, color: C.muted, marginBottom: 2 }}>{a.from_date}</div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: C.muted }}>{a.baseline_value} <span style={{ fontSize: 10 }}>{a.unit}</span></div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", color: style.color, fontSize: 18 }}>
                      {a.direction === "up" ? "↑" : "↓"}
                    </div>
                    <div style={{ background: style.color + "22", borderRadius: 8, padding: "6px 12px", textAlign: "center", flex: 1 }}>
                      <div style={{ fontSize: 10, color: C.muted, marginBottom: 2 }}>{a.to_date}</div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: style.color }}>{a.current_value} <span style={{ fontSize: 10 }}>{a.unit}</span></div>
                    </div>
                  </div>
                  <div style={{ fontSize: 11, color: C.muted, marginTop: 8 }}>
                    {a.streak_days} consecutive days trending {a.direction === "up" ? "up" : "down"}
                  </div>
                </div>
              );
            })
          )}

          <button onClick={() => loadAlerts(selPatient)}
            style={{
              width: "100%", marginTop: 8, padding: "12px",
              borderRadius: 10, border: `1px solid ${C.border}`,
              background: "none", color: C.muted,
              cursor: "pointer", fontSize: 14,
            }}>
            ↻ Re-check Trends
          </button>
        </>
      )}
    </div>
  );
}
