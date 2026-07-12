import { useState, useEffect } from "react";
import { vitalsAPI, alertsAPI, medicationsAPI, symptomsAPI, healthScoreAPI } from "../services/api";
import { getHealthReports } from "../utils/reportLog";

const C = {
  bg: "#030c2c", card: "#04163c", border: "rgba(59,201,232,0.18)",
  accent: "#3BC9E8", accent2: "#00f5a0", danger: "#ff4d6d",
  warn: "#ffd166", text: "#e8f4f8", muted: "rgba(232,244,248,0.5)",
};

const EVENT_TYPES = {
  vital:        { icon: "💓", label: "Vital",        color: "#3BC9E8" },
  alert:        { icon: "🚨", label: "Alert",        color: "#ff4d6d" },
  medication:   { icon: "💊", label: "Medication",   color: "#9b59b6" },
  symptom:      { icon: "🤒", label: "Symptom",      color: "#f97316" },
  report:       { icon: "📋", label: "Report",       color: "#00f5a0" },
  health_score: { icon: "💯", label: "Health Score", color: "#ffd166" },
};

function TimelineEvent({ event }) {
  const type  = EVENT_TYPES[event.type] || EVENT_TYPES.vital;
  const date  = new Date(event.occurred_at || event.recorded_at || event.created_at);
  const dateStr = date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  const timeStr = date.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });

  return (
    <div style={{ display: "flex", gap: 14, marginBottom: 4 }}>
      {/* ── Timeline line ── */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", minWidth: 36 }}>
        <div style={{
          width: 36, height: 36, borderRadius: "50%",
          background: type.color + "22", border: `2px solid ${type.color}`,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 16, flexShrink: 0,
        }}>
          {type.icon}
        </div>
        <div style={{ width: 2, flex: 1, background: C.border, minHeight: 20, marginTop: 4 }} />
      </div>

      {/* ── Event content ── */}
      <div style={{
        background: C.card, border: `1px solid ${C.border}`,
        borderRadius: 12, padding: "12px 16px", flex: 1, marginBottom: 12,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 6 }}>
          <span style={{
            background: type.color + "22", color: type.color,
            border: `1px solid ${type.color}44`, borderRadius: 6,
            padding: "2px 8px", fontSize: 11, fontWeight: 700,
          }}>{type.label}</span>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 11, color: C.muted }}>{dateStr}</div>
            <div style={{ fontSize: 11, color: C.muted }}>{timeStr}</div>
          </div>
        </div>
        <div style={{ fontSize: 14, fontWeight: 600, color: C.text, marginTop: 8 }}>
          {event.title || event.message || event.description || "Health event"}
        </div>
        {event.details && (
          <div style={{ fontSize: 12, color: C.muted, marginTop: 4, lineHeight: 1.5 }}>
            {event.details}
          </div>
        )}
        {/* Vitals specific display */}
        {event.type === "vital" && event.data && (
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 8 }}>
            {Object.entries(event.data).filter(([k, v]) => v && !["patient_id","id","source","recorded_at","created_at","updated_at"].includes(k)).map(([k, v]) => (
              <span key={k} style={{ background: "rgba(59,201,232,0.08)", borderRadius: 6, padding: "2px 8px", fontSize: 11, color: C.accent }}>
                {k.replace(/_/g, " ")}: {v}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function TimelinePage({ patients }) {
  const [selPatient, setSelPatient] = useState("");
  const [events, setEvents]         = useState([]);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState("");
  const [filter, setFilter]         = useState("all");
  const [dateFrom, setDateFrom]     = useState("");
  const [dateTo, setDateTo]         = useState("");

  async function loadTimeline(patientId) {
    if (!patientId) return;
    setLoading(true); setError(""); setEvents([]);
    try {
      // Build timeline directly from vitals + alerts + medications + symptoms
      // + health-score history (the /api/timeline endpoint was returning
      // empty results, so we don't depend on it). allSettled is used so a
      // missing/erroring source (e.g. no medications recorded) doesn't
      // break the whole timeline.
      const [vRes, aRes, mRes, sRes, hRes] = await Promise.allSettled([
        vitalsAPI.getForPatient(patientId, 50),
        alertsAPI.getForPatient(patientId),
        medicationsAPI.getForPatient(patientId),
        symptomsAPI.getForPatient(patientId),
        healthScoreAPI.getHistory(patientId, 30),
      ]);

      const vitalEvents = vRes.status === "fulfilled" ? (vRes.value.data || []).map(v => ({
        id: `vital-${v.id}`,
        type: "vital",
        occurred_at: v.recorded_at,
        title: `Vitals recorded`,
        details: [
          v.heart_rate  ? `HR: ${v.heart_rate} bpm` : null,
          v.spo2        ? `SpO2: ${v.spo2}%`        : null,
          v.systolic_bp ? `BP: ${v.systolic_bp}/${v.diastolic_bp}` : null,
          v.temperature ? `Temp: ${v.temperature}°C` : null,
        ].filter(Boolean).join(" · "),
        data: v,
      })) : [];

      const alertEvents = aRes.status === "fulfilled" ? (aRes.value.data || []).map(a => ({
        id: `alert-${a.id}`,
        type: "alert",
        occurred_at: a.recorded_at,
        title: a.message,
        details: `Category: ${a.category} · ${a.acknowledged ? "Acknowledged" : "Unacknowledged"}`,
      })) : [];

      const medicationEvents = mRes.status === "fulfilled" ? (mRes.value.data || []).map(m => ({
        id: `medication-${m.id}`,
        type: "medication",
        occurred_at: m.taken_at || m.scheduled_at || m.created_at,
        title: m.name || m.medication_name || "Medication event",
        details: [
          m.dosage ? `Dosage: ${m.dosage}` : null,
          m.status ? `Status: ${m.status}` : null,
        ].filter(Boolean).join(" · "),
      })) : [];

      const symptomEvents = sRes.status === "fulfilled" ? (sRes.value.data || []).map(s => ({
        id: `symptom-${s.id}`,
        type: "symptom",
        occurred_at: s.reported_at || s.created_at,
        title: s.name || s.symptom || "Symptom reported",
        details: s.severity ? `Severity: ${s.severity}` : (s.notes || ""),
      })) : [];

      // Turn day-to-day health score history into "score changed" events
      let scoreEvents = [];
      if (hRes.status === "fulfilled") {
        const history = (hRes.value.data.history || []).slice().sort(
          (a, b) => new Date(a.date) - new Date(b.date)
        );
        for (let i = 1; i < history.length; i++) {
          const prev = history[i - 1];
          const curr = history[i];
          if (curr.total === prev.total) continue; // no change, skip
          const diff = curr.total - prev.total;
          scoreEvents.push({
            id: `healthscore-${curr.date}`,
            type: "health_score",
            occurred_at: curr.date,
            title: `Health Score ${diff > 0 ? "improved" : "declined"} to ${curr.total} (${curr.grade})`,
            details: `${diff > 0 ? "+" : ""}${diff} points vs previous day (was ${prev.total})`,
          });
        }
      }

      // Locally-logged report events (AI Insights runs, etc.) - see
      // src/utils/reportLog.js. No backend endpoint persists these yet.
      const reportEvents = getHealthReports(patientId);

      const allEvents = [...vitalEvents, ...alertEvents, ...medicationEvents, ...symptomEvents, ...scoreEvents, ...reportEvents];

      // Sort by date descending
      allEvents.sort((a, b) => new Date(b.occurred_at || b.recorded_at) - new Date(a.occurred_at || a.recorded_at));
      setEvents(allEvents);
    } catch (e) {
      setError("Could not load timeline");
    }
    setLoading(false);
  }

  function handlePatientChange(e) {
    setSelPatient(e.target.value);
    loadTimeline(e.target.value);
  }

  // Apply filters
  const filtered = events.filter(ev => {
    if (filter !== "all" && ev.type !== filter) return false;
    const d = new Date(ev.occurred_at || ev.recorded_at);
    if (dateFrom && d < new Date(dateFrom)) return false;
    if (dateTo   && d > new Date(dateTo + "T23:59:59")) return false;
    return true;
  });

  const selectStyle = {
    padding: "10px 16px", borderRadius: 10,
    background: "rgba(59,201,232,0.07)", border: `1px solid ${C.border}`,
    color: C.text, fontSize: 14, outline: "none",
    boxSizing: "border-box", fontFamily: "inherit",
  };

  return (
    <div style={{ fontFamily: "'Segoe UI', sans-serif", color: C.text }}>
      <h2 style={{ margin: "0 0 6px", fontSize: 22 }}>📅 Health Timeline</h2>
      <p style={{ color: C.muted, fontSize: 14, marginBottom: 20 }}>
        Chronological view of all health events — vitals, alerts, medications and more.
      </p>

      {/* ── Patient selector ── */}
      <select value={selPatient} onChange={handlePatientChange} style={{ ...selectStyle, width: "100%", marginBottom: 16 }}>
        <option value="">— Select a patient —</option>
        {(patients || []).map(p => (
          <option key={p.patient_id} value={p.patient_id}>{p.name} ({p.patient_id})</option>
        ))}
      </select>

      {selPatient && (
        <>
          {/* ── Filters ── */}
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, marginBottom: 20 }}>
            <div style={{ fontSize: 12, color: C.muted, marginBottom: 10, fontWeight: 600, letterSpacing: 1 }}>FILTER BY TYPE</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
              {["all", ...Object.keys(EVENT_TYPES)].map(t => (
                <button key={t} onClick={() => setFilter(t)}
                  style={{
                    padding: "5px 12px", borderRadius: 8, border: "none",
                    background: filter === t ? C.accent : "rgba(59,201,232,0.08)",
                    color: filter === t ? C.bg : C.muted,
                    fontWeight: 600, fontSize: 12, cursor: "pointer",
                    textTransform: "capitalize",
                  }}>
                  {t === "all" ? "All" : (EVENT_TYPES[t]?.icon + " " + EVENT_TYPES[t]?.label)}
                </button>
              ))}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div>
                <div style={{ fontSize: 11, color: C.muted, marginBottom: 4 }}>FROM DATE</div>
                <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                  style={{ ...selectStyle, width: "100%" }} />
              </div>
              <div>
                <div style={{ fontSize: 11, color: C.muted, marginBottom: 4 }}>TO DATE</div>
                <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                  style={{ ...selectStyle, width: "100%" }} />
              </div>
            </div>
          </div>

          {/* ── Stats bar ── */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 20 }}>
            {[
              { label: "Total Events", value: filtered.length, color: C.accent },
              { label: "Alerts",       value: filtered.filter(e => e.type === "alert").length,  color: C.danger },
              { label: "Vitals",       value: filtered.filter(e => e.type === "vital").length,  color: C.accent2 },
            ].map(s => (
              <div key={s.label} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: 12, textAlign: "center" }}>
                <div style={{ fontSize: 22, fontWeight: 800, color: s.color }}>{s.value}</div>
                <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* ── Timeline ── */}
          {loading && <div style={{ color: C.accent, textAlign: "center", padding: 40 }}>Loading timeline...</div>}
          {error   && <div style={{ color: C.danger, padding: 16, background: "rgba(255,77,109,0.1)", borderRadius: 10, marginBottom: 16 }}>⚠️ {error}</div>}
          {!loading && filtered.length === 0 && (
            <div style={{ color: C.muted, textAlign: "center", padding: 60 }}>No events found for selected filters.</div>
          )}
          {!loading && filtered.map((ev, i) => (
            <TimelineEvent key={ev.id || i} event={ev} />
          ))}
        </>
      )}

      {!selPatient && (
        <div style={{ color: C.muted, textAlign: "center", padding: 60 }}>
          Select a patient to view their health timeline
        </div>
      )}
    </div>
  );
}