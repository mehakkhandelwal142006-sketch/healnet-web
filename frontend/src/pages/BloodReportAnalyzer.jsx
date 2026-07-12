import { useState, useRef } from "react";
import { bloodReportsAPI } from "../services/api";

const C = {
  bg: "#030c2c", card: "#04163c", border: "rgba(59,201,232,0.18)",
  accent: "#3BC9E8", accent2: "#00f5a0", danger: "#ff4d6d",
  warn: "#ffd166", text: "#e8f4f8", muted: "rgba(232,244,248,0.5)",
};

const STATUS_STYLE = {
  high:   { color: C.danger,  icon: "⬆️", label: "High" },
  low:    { color: "#f97316", icon: "⬇️", label: "Low" },
  normal: { color: C.accent2, icon: "✓",  label: "Normal" },
};

function explanationSentence(v) {
  if (v.status === "normal") return null;
  const dir = v.status === "high" ? "higher" : "lower";
  return `${v.label} is ${v.value} ${v.unit}, which is ${dir} than the normal range (${v.low}–${v.high} ${v.unit}).`;
}

function ValueCard({ v, prev }) {
  const style = STATUS_STYLE[v.status];
  const prevValue = prev?.values?.find(p => p.key === v.key);
  const trend = prevValue ? (v.value > prevValue.value ? "up" : v.value < prevValue.value ? "down" : "same") : null;

  return (
    <div style={{
      background: style.color + "12", border: `1px solid ${style.color}44`,
      borderLeft: `4px solid ${style.color}`, borderRadius: 12,
      padding: "12px 16px", marginBottom: 10,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{v.label}</span>
        <span style={{
          background: style.color + "22", color: style.color,
          border: `1px solid ${style.color}44`, borderRadius: 6,
          padding: "2px 8px", fontSize: 11, fontWeight: 700,
        }}>
          {style.icon} {style.label}
        </span>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginTop: 6 }}>
        <div>
          <span style={{ fontSize: 20, fontWeight: 800, color: style.color }}>{v.value}</span>
          <span style={{ fontSize: 12, color: C.muted, marginLeft: 4 }}>{v.unit}</span>
        </div>
        <div style={{ fontSize: 11, color: C.muted }}>Normal: {v.low}–{v.high} {v.unit}</div>
      </div>
      {prevValue && (
        <div style={{ fontSize: 11, color: C.muted, marginTop: 6 }}>
          Previous report: {prevValue.value} {v.unit} {trend === "up" ? "↑" : trend === "down" ? "↓" : "→"} now {v.value} {v.unit}
        </div>
      )}
    </div>
  );
}

export default function BloodReportAnalyzer({ patients }) {
  const [selPatient, setSelPatient] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [currentReport, setCurrentReport] = useState(null);
  const [history, setHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [showRawText, setShowRawText] = useState(false);
  const fileInputRef = useRef(null);

  async function loadHistory(patientId) {
    setLoadingHistory(true);
    try {
      const res = await bloodReportsAPI.getForPatient(patientId);
      setHistory(res.data || []);
    } catch {
      setHistory([]);
    }
    setLoadingHistory(false);
  }

  function handlePatientChange(e) {
    const id = e.target.value;
    setSelPatient(id);
    setCurrentReport(null);
    if (id) loadHistory(id);
  }

  async function handleFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    if (!selPatient) { setError("Select a patient first."); return; }

    setUploading(true); setError(""); setCurrentReport(null);
    try {
      const res = await bloodReportsAPI.upload(selPatient, file);
      setCurrentReport(res.data);
      await loadHistory(selPatient);
    } catch (err) {
      setError(err.response?.data?.detail || "Could not process this report. Try a clearer image or different file.");
    }
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function viewReport(report) {
    setCurrentReport(report);
  }

  async function handleDelete(reportId) {
    try {
      await bloodReportsAPI.delete(reportId);
      await loadHistory(selPatient);
      if (currentReport?.id === reportId) setCurrentReport(null);
    } catch (err) {
      setError("Could not delete this report.");
    }
  }

  const previousReport = currentReport
    ? history.find(r => r.id !== currentReport.id && new Date(r.uploaded_at) < new Date(currentReport.uploaded_at))
    : null;

  const abnormalValues = currentReport?.values?.filter(v => v.status !== "normal") || [];
  const normalValues = currentReport?.values?.filter(v => v.status === "normal") || [];

  const selectStyle = {
    padding: "10px 16px", borderRadius: 10,
    background: "rgba(59,201,232,0.07)", border: `1px solid ${C.border}`,
    color: C.text, fontSize: 14, outline: "none",
    boxSizing: "border-box", fontFamily: "inherit",
  };

  return (
    <div style={{ fontFamily: "'Segoe UI', sans-serif", color: C.text }}>
      <h2 style={{ margin: "0 0 6px", fontSize: 22 }}>🩸 Blood Report Analyzer</h2>
      <p style={{ color: C.muted, fontSize: 14, marginBottom: 20 }}>
        Upload a blood report (PDF or photo) — abnormal values get flagged automatically and explained in plain language.
      </p>

      <select value={selPatient} onChange={handlePatientChange}
        style={{ ...selectStyle, width: "100%", marginBottom: 16 }}>
        <option value="">— Select a patient —</option>
        {(patients || []).map(p => (
          <option key={p.patient_id} value={p.patient_id}>{p.name} ({p.patient_id})</option>
        ))}
      </select>

      {selPatient && (
        <>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,application/pdf"
            onChange={handleFile}
            disabled={uploading}
            style={{ display: "none" }}
            id="blood-report-upload"
          />
          <label htmlFor="blood-report-upload"
            style={{
              display: "block", textAlign: "center", padding: "20px",
              border: `2px dashed ${C.border}`, borderRadius: 12,
              color: uploading ? C.muted : C.accent, cursor: uploading ? "default" : "pointer",
              marginBottom: 20, fontSize: 14, fontWeight: 600,
            }}>
            {uploading ? "Uploading & analyzing (this can take 10-20 seconds)..." : "📄 Tap to upload a blood report (PDF or photo)"}
          </label>

          {error && (
            <div style={{ color: C.danger, padding: 16, background: "rgba(255,77,109,0.1)", borderRadius: 10, marginBottom: 16, fontSize: 13 }}>
              ⚠️ {error}
            </div>
          )}

          {/* ── Past reports list ── */}
          {loadingHistory && (
            <div style={{ color: C.muted, textAlign: "center", padding: 20, fontSize: 13 }}>Loading report history...</div>
          )}
          {!loadingHistory && history.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 12, color: C.muted, marginBottom: 8, fontWeight: 600, letterSpacing: 1 }}>REPORT HISTORY</div>
              {history.map(r => (
                <div key={r.id} onClick={() => viewReport(r)}
                  style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    padding: "10px 14px", borderRadius: 10, marginBottom: 6, cursor: "pointer",
                    background: currentReport?.id === r.id ? "rgba(59,201,232,0.12)" : C.card,
                    border: `1px solid ${currentReport?.id === r.id ? C.accent : C.border}`,
                  }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{r.file_name}</div>
                    <div style={{ fontSize: 11, color: C.muted }}>{new Date(r.uploaded_at).toLocaleString()}</div>
                  </div>
                  <button onClick={(e) => { e.stopPropagation(); handleDelete(r.id); }}
                    style={{ background: "none", border: "none", color: C.danger, cursor: "pointer", fontSize: 12 }}>
                    Delete
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* ── Current report analysis ── */}
          {currentReport && (
            <>
              <div style={{
                background: abnormalValues.length > 0 ? C.danger + "12" : C.accent2 + "12",
                border: `1px solid ${abnormalValues.length > 0 ? C.danger : C.accent2}44`,
                borderRadius: 16, padding: 20, marginBottom: 20,
              }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: abnormalValues.length > 0 ? C.danger : C.accent2, marginBottom: 6 }}>
                  {abnormalValues.length > 0
                    ? `${abnormalValues.length} value${abnormalValues.length > 1 ? "s" : ""} outside normal range`
                    : "All detected values are within normal range"}
                </div>
                <div style={{ fontSize: 12, color: C.muted }}>
                  {currentReport.values.length} value{currentReport.values.length > 1 ? "s" : ""} detected from {currentReport.file_name}
                  {previousReport && " · compared against previous report"}
                </div>
              </div>

              {abnormalValues.length > 0 && (
                <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 20, marginBottom: 16 }}>
                  <h4 style={{ margin: "0 0 12px", color: C.accent, fontSize: 15 }}>📋 What this means</h4>
                  {abnormalValues.map((v, i) => (
                    <div key={i} style={{ fontSize: 13, color: C.text, lineHeight: 1.6, marginBottom: 8 }}>
                      • {explanationSentence(v)}
                    </div>
                  ))}
                  <div style={{ fontSize: 11, color: C.muted, marginTop: 10, fontStyle: "italic" }}>
                    This is a rule-based summary, not a medical diagnosis. Please consult a doctor about any abnormal results.
                  </div>
                </div>
              )}

              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 20, marginBottom: 16 }}>
                <h4 style={{ margin: "0 0 12px", color: C.accent, fontSize: 15 }}>All Detected Values</h4>
                {[...abnormalValues, ...normalValues].map((v, i) => (
                  <ValueCard key={i} v={v} prev={previousReport} />
                ))}
              </div>

              <button onClick={() => setShowRawText(s => !s)}
                style={{
                  width: "100%", padding: "10px", borderRadius: 10, border: `1px solid ${C.border}`,
                  background: "none", color: C.muted, cursor: "pointer", fontSize: 13, marginBottom: 8,
                }}>
                {showRawText ? "Hide" : "Show"} raw scanned text
              </button>
              {showRawText && (
                <pre style={{
                  background: "rgba(0,0,0,0.3)", borderRadius: 10, padding: 14,
                  fontSize: 11, color: C.muted, whiteSpace: "pre-wrap", maxHeight: 200, overflowY: "auto",
                }}>
                  {currentReport.raw_text}
                </pre>
              )}
            </>
          )}
        </>
      )}

      {!selPatient && (
        <div style={{ color: C.muted, textAlign: "center", padding: 60 }}>
          Select a patient to upload and analyze a blood report
        </div>
      )}
    </div>
  );
}
