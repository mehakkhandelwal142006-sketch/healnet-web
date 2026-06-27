import { useState, useEffect, useCallback } from "react";
import { timelineAPI, symptomsAPI, medicationsAPI } from "../services/api";

// ── Theme — matches App.jsx exactly ─────────────────────────────────
const C = {
  bg:     "#030c2c",
  card:   "#04163c",
  border: "rgba(59,201,232,0.18)",
  accent: "#3BC9E8",
  accent2:"#00f5a0",
  danger: "#ff4d6d",
  warn:   "#ffd166",
  text:   "#e8f4f8",
  muted:  "rgba(232,244,248,0.5)",
};

const css = (s) => s;

const EVENT_ICONS = {
  vital_change: "💓",
  ai_alert:     "🚨",
  medication:   "💊",
  symptom:      "🩹",
  report:       "📄",
  health_score: "📊",
};

const EVENT_LABELS = {
  vital_change: "Vitals",
  ai_alert:     "Alert",
  medication:   "Medication",
  symptom:      "Symptom",
  report:       "Report",
  health_score: "Health Score",
};

function severityColor(sev) {
  if (sev === "critical") return C.danger;
  if (sev === "warning")  return C.warn;
  return C.accent2;
}

// ═══════════════════════════════════════════════════════════════════
//  EVENT CARD
// ═══════════════════════════════════════════════════════════════════
function EventCard({ event }) {
  const color = severityColor(event.severity);
  return (
    <div style={css({
      display: "flex", gap: 14, padding: "16px 0",
      borderBottom: `1px solid ${C.border}44`,
    })}>
      <div style={css({
        width: 36, height: 36, borderRadius: "50%",
        background: color + "22", border: `1px solid ${color}44`,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 16, flexShrink: 0,
      })}>
        {EVENT_ICONS[event.event_type] || "•"}
      </div>
      <div style={css({ flex: 1, minWidth: 0 })}>
        <div style={css({ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" })}>
          <div style={css({ fontWeight: 600, color: C.text })}>{event.title}</div>
          <div style={css({ color: C.muted, fontSize: 12, whiteSpace: "nowrap" })}>
            {new Date(event.occurred_at).toLocaleString()}
          </div>
        </div>
        {event.description && (
          <div style={css({ color: C.muted, fontSize: 13, marginTop: 4 })}>{event.description}</div>
        )}
        <div style={css({ marginTop: 6 })}>
          <span style={css({
            background: color + "1a", color, border: `1px solid ${color}44`,
            borderRadius: 6, padding: "2px 9px", fontSize: 11, fontWeight: 600,
          })}>
            {EVENT_LABELS[event.event_type] || event.event_type}
          </span>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
//  QUICK LOG FORMS (symptom + medication)
// ═══════════════════════════════════════════════════════════════════
function QuickLogForms({ patientId, onLogged }) {
  const [tab, setTab]         = useState("symptom");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg]         = useState("");

  const [symptomForm, setSymptomForm] = useState({ symptom: "", severity: "mild", notes: "" });
  const [medForm, setMedForm]         = useState({ medication_name: "", dosage: "", notes: "" });

  const inputS = css({
    width: "100%", padding: "10px 14px", borderRadius: 8,
    background: "rgba(59,201,232,0.07)", border: `1px solid ${C.border}`,
    color: C.text, fontSize: 14, outline: "none",
    boxSizing: "border-box", fontFamily: "inherit",
  });

  async function logSymptom() {
    if (!symptomForm.symptom) { setMsg("Symptom name is required"); return; }
    setLoading(true); setMsg("");
    try {
      await symptomsAPI.record({ patient_id: patientId, ...symptomForm });
      setMsg("✅ Symptom logged.");
      setSymptomForm({ symptom: "", severity: "mild", notes: "" });
      onLogged();
    } catch (e) {
      setMsg(e.response?.data?.detail || "Error logging symptom");
    }
    setLoading(false);
  }

  async function logMedication() {
    if (!medForm.medication_name) { setMsg("Medication name is required"); return; }
    setLoading(true); setMsg("");
    try {
      await medicationsAPI.record({ patient_id: patientId, ...medForm });
      setMsg("✅ Medication logged.");
      setMedForm({ medication_name: "", dosage: "", notes: "" });
      onLogged();
    } catch (e) {
      setMsg(e.response?.data?.detail || "Error logging medication");
    }
    setLoading(false);
  }

  return (
    <div style={css({ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 24, marginBottom: 24 })}>
      <div style={css({ display: "flex", gap: 8, marginBottom: 18 })}>
        {[["symptom", "🩹 Log Symptom"], ["medication", "💊 Log Medication"]].map(([k, label]) => (
          <button key={k} onClick={() => { setTab(k); setMsg(""); }}
            style={css({
              flex: 1, padding: "10px", borderRadius: 8, border: "none",
              cursor: "pointer", fontWeight: 600, fontSize: 13,
              background: tab === k ? C.accent : "rgba(59,201,232,0.08)",
              color: tab === k ? C.bg : C.muted,
            })}>
            {label}
          </button>
        ))}
      </div>

      {tab === "symptom" ? (
        <div style={css({ display: "flex", flexDirection: "column", gap: 12 })}>
          <input placeholder="Symptom (e.g. headache, fatigue)" value={symptomForm.symptom}
            onChange={e => setSymptomForm(f => ({ ...f, symptom: e.target.value }))} style={inputS} />
          <select value={symptomForm.severity}
            onChange={e => setSymptomForm(f => ({ ...f, severity: e.target.value }))} style={inputS}>
            <option value="mild">Mild</option>
            <option value="moderate">Moderate</option>
            <option value="severe">Severe</option>
          </select>
          <input placeholder="Notes (optional)" value={symptomForm.notes}
            onChange={e => setSymptomForm(f => ({ ...f, notes: e.target.value }))} style={inputS} />
          <button onClick={logSymptom} disabled={loading}
            style={css({ padding: "11px", borderRadius: 8, border: "none", background: C.accent, color: C.bg, fontWeight: 700, cursor: "pointer" })}>
            {loading ? "Saving..." : "Log Symptom"}
          </button>
        </div>
      ) : (
        <div style={css({ display: "flex", flexDirection: "column", gap: 12 })}>
          <input placeholder="Medication name" value={medForm.medication_name}
            onChange={e => setMedForm(f => ({ ...f, medication_name: e.target.value }))} style={inputS} />
          <input placeholder="Dosage (e.g. 500mg)" value={medForm.dosage}
            onChange={e => setMedForm(f => ({ ...f, dosage: e.target.value }))} style={inputS} />
          <input placeholder="Notes (optional)" value={medForm.notes}
            onChange={e => setMedForm(f => ({ ...f, notes: e.target.value }))} style={inputS} />
          <button onClick={logMedication} disabled={loading}
            style={css({ padding: "11px", borderRadius: 8, border: "none", background: C.accent, color: C.bg, fontWeight: 700, cursor: "pointer" })}>
            {loading ? "Saving..." : "Log Medication"}
          </button>
        </div>
      )}

      {msg && (
        <div style={css({ marginTop: 10, fontSize: 13, color: msg.startsWith("✅") ? C.accent2 : C.danger })}>
          {msg}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
//  TIMELINE PAGE
// ═══════════════════════════════════════════════════════════════════
export default function TimelinePage({ patientId, patientName }) {
  const [events, setEvents]     = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState("");

  const [eventType, setEventType] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate]     = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const res = await timelineAPI.getForPatient(patientId, {
        event_type: eventType || undefined,
        start_date: startDate || undefined,
        end_date: endDate || undefined,
      });
      setEvents(res.data);
    } catch (e) {
      setError("Could not load timeline. Try again once you're back online.");
    }
    setLoading(false);
  }, [patientId, eventType, startDate, endDate]);

  useEffect(() => { load(); }, [load]);

  const filterPills = [
    ["", "All"],
    ["vital_change", "💓 Vitals"],
    ["ai_alert", "🚨 Alerts"],
    ["medication", "💊 Medication"],
    ["symptom", "🩹 Symptoms"],
    ["health_score", "📊 Health Score"],
  ];

  const inputS = css({
    padding: "9px 12px", borderRadius: 8,
    background: "rgba(59,201,232,0.07)", border: `1px solid ${C.border}`,
    color: C.text, fontSize: 13, outline: "none", fontFamily: "inherit",
  });

  return (
    <div>
      <h2 style={css({ margin: "0 0 4px", fontSize: 24 })}>🕓 Health Timeline</h2>
      {patientName && (
        <div style={css({ color: C.muted, fontSize: 13, marginBottom: 24 })}>{patientName}</div>
      )}

      <QuickLogForms patientId={patientId} onLogged={load} />

      {/* ── Filters ──────────────────────────────────────────────── */}
      <div style={css({ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" })}>
        {filterPills.map(([val, label]) => (
          <button key={val} onClick={() => setEventType(val)}
            style={css({
              padding: "7px 14px", borderRadius: 20, border: `1px solid ${C.border}`,
              cursor: "pointer", fontSize: 12.5, fontWeight: 600,
              background: eventType === val ? C.accent : "transparent",
              color: eventType === val ? C.bg : C.muted,
            })}>
            {label}
          </button>
        ))}
      </div>

      <div style={css({ display: "flex", gap: 10, marginBottom: 20, alignItems: "center", flexWrap: "wrap" })}>
        <label style={css({ color: C.muted, fontSize: 12 })}>From</label>
        <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} style={inputS} />
        <label style={css({ color: C.muted, fontSize: 12 })}>To</label>
        <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} style={inputS} />
        {(startDate || endDate) && (
          <button onClick={() => { setStartDate(""); setEndDate(""); }}
            style={css({ background: "none", border: "none", color: C.accent, cursor: "pointer", fontSize: 12 })}>
            Clear dates
          </button>
        )}
      </div>

      {/* ── Feed ─────────────────────────────────────────────────── */}
      <div style={css({ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: "8px 24px" })}>
        {loading ? (
          <div style={css({ color: C.muted, textAlign: "center", padding: 40 })}>Loading timeline...</div>
        ) : error ? (
          <div style={css({ color: C.danger, textAlign: "center", padding: 40 })}>{error}</div>
        ) : events.length === 0 ? (
          <div style={css({ color: C.muted, textAlign: "center", padding: 40 })}>
            No events yet for this filter.
          </div>
        ) : (
          events.map(ev => <EventCard key={ev.id} event={ev} />)
        )}
      </div>
    </div>
  );
}
