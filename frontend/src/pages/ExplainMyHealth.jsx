import { useState } from "react";
import { healthScoreAPI, patientsAPI } from "../services/api";

const C = {
  bg: "#030c2c", card: "#04163c", border: "rgba(59,201,232,0.18)",
  accent: "#3BC9E8", accent2: "#00f5a0", danger: "#ff4d6d",
  warn: "#ffd166", text: "#e8f4f8", muted: "rgba(232,244,248,0.5)",
};

function InsightCard({ insight }) {
  const statusColor = {
    improved: C.accent2,
    worsened: C.danger,
    watch:    C.warn,
    stable:   C.muted,
  }[insight.status] || C.muted;

  const statusIcon = {
    improved: "✅",
    worsened: "⚠️",
    watch:    "👀",
    stable:   "➡️",
  }[insight.status] || "➡️";

  const arrow = insight.direction === "up" ? "↑" : "↓";

  return (
    <div style={{
      background: statusColor + "12",
      border: `1px solid ${statusColor}44`,
      borderLeft: `4px solid ${statusColor}`,
      borderRadius: 12, padding: "14px 16px", marginBottom: 12,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{statusIcon} {insight.label}</span>
        <div style={{ textAlign: "right" }}>
          <span style={{ fontSize: 16, fontWeight: 800, color: statusColor }}>
            {arrow} {insight.pct_change ? `${Math.abs(insight.pct_change)}%` : `${Math.abs(insight.change)} ${insight.unit}`}
          </span>
        </div>
      </div>
      <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.5, marginBottom: 8 }}>
        {insight.sentence}
      </div>
      <div style={{ display: "flex", gap: 12 }}>
        <div style={{ background: "rgba(255,255,255,0.05)", borderRadius: 8, padding: "6px 12px", textAlign: "center", flex: 1 }}>
          <div style={{ fontSize: 10, color: C.muted, marginBottom: 2 }}>LAST WEEK</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.muted }}>{insight.old_value} <span style={{ fontSize: 10 }}>{insight.unit}</span></div>
        </div>
        <div style={{ display: "flex", alignItems: "center", color: statusColor, fontSize: 18 }}>{arrow}</div>
        <div style={{ background: statusColor + "22", borderRadius: 8, padding: "6px 12px", textAlign: "center", flex: 1 }}>
          <div style={{ fontSize: 10, color: C.muted, marginBottom: 2 }}>THIS WEEK</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: statusColor }}>{insight.new_value} <span style={{ fontSize: 10 }}>{insight.unit}</span></div>
        </div>
      </div>
    </div>
  );
}

function ScoreComparison({ thisWeek, lastWeek }) {
  const diff  = thisWeek - lastWeek;
  const color = diff >= 0 ? C.accent2 : C.danger;
  const arrow = diff >= 0 ? "↑" : "↓";

  return (
    <div style={{
      background: C.card, border: `1px solid ${C.border}`,
      borderRadius: 16, padding: 20, marginBottom: 20,
    }}>
      <div style={{ fontSize: 12, color: C.muted, letterSpacing: 1, marginBottom: 16 }}>WEEKLY SCORE COMPARISON</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: 12, alignItems: "center" }}>
        <div style={{ textAlign: "center", background: "rgba(255,255,255,0.04)", borderRadius: 12, padding: 16 }}>
          <div style={{ fontSize: 11, color: C.muted, marginBottom: 6 }}>LAST WEEK</div>
          <div style={{ fontSize: 36, fontWeight: 800, color: C.muted }}>{lastWeek}</div>
          <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>/ 100</div>
        </div>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 28, fontWeight: 800, color }}>
            {arrow} {Math.abs(diff)}
          </div>
          <div style={{ fontSize: 11, color, marginTop: 4 }}>
            {diff >= 0 ? "Improved" : "Declined"}
          </div>
        </div>
        <div style={{ textAlign: "center", background: color + "22", borderRadius: 12, padding: 16, border: `1px solid ${color}44` }}>
          <div style={{ fontSize: 11, color: C.muted, marginBottom: 6 }}>THIS WEEK</div>
          <div style={{ fontSize: 36, fontWeight: 800, color }}>{thisWeek}</div>
          <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>/ 100</div>
        </div>
      </div>
    </div>
  );
}

function SummaryBanner({ summary, improved, worsened }) {
  const isGood  = improved > worsened;
  const isBad   = worsened > improved;
  const color   = isGood ? C.accent2 : isBad ? C.danger : C.warn;
  const icon    = isGood ? "🌟" : isBad ? "⚠️" : "📊";

  return (
    <div style={{
      background: color + "15", border: `1px solid ${color}44`,
      borderRadius: 16, padding: 20, marginBottom: 20,
    }}>
      <div style={{ fontSize: 24, marginBottom: 10 }}>{icon}</div>
      <div style={{ fontSize: 15, fontWeight: 700, color, marginBottom: 8 }}>
        {isGood ? "Health Improving!" : isBad ? "Needs Attention" : "Health Stable"}
      </div>
      <div style={{ fontSize: 13, color: C.text, lineHeight: 1.6 }}>{summary}</div>
      <div style={{ display: "flex", gap: 16, marginTop: 16 }}>
        <div style={{ flex: 1, textAlign: "center", background: C.accent2 + "22", borderRadius: 10, padding: 10 }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: C.accent2 }}>{improved}</div>
          <div style={{ fontSize: 11, color: C.muted }}>Improved</div>
        </div>
        <div style={{ flex: 1, textAlign: "center", background: C.danger + "22", borderRadius: 10, padding: 10 }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: C.danger }}>{worsened}</div>
          <div style={{ fontSize: 11, color: C.muted }}>Worsened</div>
        </div>
      </div>
    </div>
  );
}

export default function ExplainMyHealth({ patients, embedded = false, patientId = "", data: externalData = null, loading: externalLoading = false, error: externalError = "" }) {
  const [selPatient, setSelPatient] = useState("");
  const [data, setData]             = useState(null);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState("");
  const [filter, setFilter]         = useState("all");

  // In embedded mode, the parent (e.g. HealthScorePage) already selected a
  // patient and fetched the explain data - just use what's passed in.
  const activePatient = embedded ? patientId : selPatient;
  const activeData    = embedded ? externalData : data;
  const activeLoading = embedded ? externalLoading : loading;
  const activeError   = embedded ? externalError : error;

  async function loadExplanation(patientId) {
    if (!patientId) return;
    setLoading(true); setError(""); setData(null);
    try {
      const res = await healthScoreAPI.explain(patientId);
      setData(res.data);
    } catch (e) {
      setError(e.response?.data?.detail || "Could not load health explanation");
    }
    setLoading(false);
  }

  function handlePatientChange(e) {
    setSelPatient(e.target.value);
    loadExplanation(e.target.value);
  }

  const filteredInsights = activeData?.insights?.filter(i => {
    if (filter === "all")      return true;
    if (filter === "improved") return i.status === "improved";
    if (filter === "worsened") return i.status === "worsened";
    return true;
  }) || [];

  const improved = activeData?.insights?.filter(i => i.status === "improved").length || 0;
  const worsened = activeData?.insights?.filter(i => i.status === "worsened").length || 0;

  const selectStyle = {
    padding: "10px 16px", borderRadius: 10,
    background: "rgba(59,201,232,0.07)", border: `1px solid ${C.border}`,
    color: C.text, fontSize: 14, outline: "none",
    boxSizing: "border-box", fontFamily: "inherit",
  };

  return (
    <div style={{ fontFamily: "'Segoe UI', sans-serif", color: C.text }}>
      {!embedded && (
        <>
          <h2 style={{ margin: "0 0 6px", fontSize: 22 }}>🔍 Explain My Health</h2>
          <p style={{ color: C.muted, fontSize: 14, marginBottom: 20 }}>
            One-click health summary comparing this week vs last week.
          </p>

          {/* ── Patient selector ── */}
          <select value={selPatient} onChange={handlePatientChange}
            style={{ ...selectStyle, width: "100%", marginBottom: 20 }}>
            <option value="">— Select a patient —</option>
            {(patients || []).map(p => (
              <option key={p.patient_id} value={p.patient_id}>{p.name} ({p.patient_id})</option>
            ))}
          </select>
        </>
      )}

      {activeLoading && (
        <div style={{ textAlign: "center", padding: 60 }}>
          <div style={{ fontSize: 36, marginBottom: 16 }}>🔍</div>
          <div style={{ color: C.accent, fontSize: 15 }}>Analyzing health trends...</div>
          <div style={{ color: C.muted, fontSize: 13, marginTop: 8 }}>Comparing this week vs last week</div>
        </div>
      )}

      {activeError && (
        <div style={{ color: C.danger, padding: 16, background: "rgba(255,77,109,0.1)", borderRadius: 10, marginBottom: 16 }}>
          ⚠️ {activeError}
        </div>
      )}

      {!activePatient && !activeLoading && !embedded && (
        <div style={{ color: C.muted, textAlign: "center", padding: 60 }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🔍</div>
          <div style={{ fontSize: 15, marginBottom: 8 }}>Select a patient to explain their health</div>
          <div style={{ fontSize: 13 }}>We'll compare this week vs last week automatically</div>
        </div>
      )}

      {activeData && !activeLoading && (
        <>
          {/* ── No data state ── */}
          {!activeData.has_data ? (
            <div style={{
              background: C.card, border: `1px solid ${C.border}`,
              borderRadius: 16, padding: 40, textAlign: "center",
            }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>📊</div>
              <div style={{ color: C.text, fontSize: 15, fontWeight: 600, marginBottom: 8 }}>Not enough data yet</div>
              <div style={{ color: C.muted, fontSize: 13, lineHeight: 1.6 }}>
                Record vitals for at least 2 weeks to see weekly comparisons and health explanations.
              </div>
            </div>
          ) : (
            <>
              {/* ── Summary banner ── */}
              <SummaryBanner summary={activeData.summary} improved={improved} worsened={worsened} />

              {/* ── Score comparison ── */}
              <ScoreComparison thisWeek={activeData.this_week_score} lastWeek={activeData.last_week_score} />

              {/* ── Filter tabs ── */}
              <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
                {[
                  { id: "all",      label: `All (${activeData.insights?.length || 0})` },
                  { id: "worsened", label: `⚠️ Worsened (${worsened})` },
                  { id: "improved", label: `✅ Improved (${improved})` },
                ].map(f => (
                  <button key={f.id} onClick={() => setFilter(f.id)}
                    style={{
                      flex: 1, padding: "8px 4px", borderRadius: 8, border: "none",
                      background: filter === f.id ? C.accent : "rgba(59,201,232,0.08)",
                      color: filter === f.id ? C.bg : C.muted,
                      fontWeight: 600, fontSize: 12, cursor: "pointer",
                    }}>
                    {f.label}
                  </button>
                ))}
              </div>

              {/* ── Insights list ── */}
              {filteredInsights.length === 0 ? (
                <div style={{ color: C.muted, textAlign: "center", padding: 40 }}>
                  No {filter} metrics this week.
                </div>
              ) : (
                filteredInsights.map((ins, i) => (
                  <InsightCard key={i} insight={ins} />
                ))
              )}

              {/* ── Refresh button (standalone mode only - embedded mode uses parent's refresh) ── */}
              {!embedded && (
                <button onClick={() => loadExplanation(selPatient)}
                  style={{
                    width: "100%", marginTop: 8, padding: "12px",
                    borderRadius: 10, border: `1px solid ${C.border}`,
                    background: "none", color: C.muted,
                    cursor: "pointer", fontSize: 14,
                  }}>
                  ↻ Refresh Analysis
                </button>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
