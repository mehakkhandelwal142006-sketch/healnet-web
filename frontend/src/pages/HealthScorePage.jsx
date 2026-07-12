import { useState, useEffect } from "react";
import { healthScoreAPI } from "../services/api";
import ExplainMyHealth from "./ExplainMyHealth";

const C = {
  bg: "#030c2c", card: "#04163c", border: "rgba(59,201,232,0.18)",
  accent: "#3BC9E8", accent2: "#00f5a0", danger: "#ff4d6d",
  warn: "#ffd166", text: "#e8f4f8", muted: "rgba(232,244,248,0.5)",
};

// ── Grade color ───────────────────────────────────────────────────
function gradeColor(grade) {
  return {
    Excellent: C.accent2,
    Good:      C.accent,
    Fair:      C.warn,
    Poor:      "#f97316",
    Critical:  C.danger,
  }[grade] || C.muted;
}

// Categories don't come with their own grade from the backend - just
// score/max - so derive a color from what % of the category max was earned,
// using the same thresholds the backend uses for the overall grade.
function categoryColor(score, max) {
  if (!max) return C.muted;
  const pct = (score / max) * 100;
  if (pct >= 85) return C.accent2;
  if (pct >= 70) return C.accent;
  if (pct >= 55) return C.warn;
  if (pct >= 40) return "#f97316";
  return C.danger;
}

// Backend doesn't send a summary sentence for this endpoint (only /explain
// does) - generate a short one locally from the grade.
function scoreSummaryText(grade) {
  return {
    Excellent: "Health metrics are looking great.",
    Good:      "Overall health is in a good range.",
    Fair:      "Some areas could use attention.",
    Poor:      "Several health indicators need attention.",
    Critical:  "Immediate attention recommended.",
  }[grade] || "";
}

// ── Score Ring ────────────────────────────────────────────────────
function ScoreRing({ score, grade }) {
  const color = gradeColor(grade);
  const r = 54, cx = 64, cy = 64;
  const circ = 2 * Math.PI * r;
  const dash = (score / 100) * circ;

  return (
    <div style={{ position: "relative", width: 128, height: 128, margin: "0 auto" }}>
      <svg width="128" height="128" viewBox="0 0 128 128">
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="10" />
        <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth="10"
          strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
          transform="rotate(-90 64 64)" style={{ transition: "stroke-dasharray 1s ease" }} />
      </svg>
      <div style={{
        position: "absolute", inset: 0,
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
      }}>
        <div style={{ fontSize: 28, fontWeight: 800, color, lineHeight: 1 }}>{score}</div>
        <div style={{ fontSize: 14, color, fontWeight: 700 }}>{grade}</div>
      </div>
    </div>
  );
}

// ── Category bar ─────────────────────────────────────────────────
function CategoryBar({ label, score, max, color, icon }) {
  const safeScore = score || 0;
  const safeMax = max || 0;
  const pct = safeMax > 0 ? Math.min(100, (safeScore / safeMax) * 100) : 0;
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
        <span style={{ fontSize: 13, color: C.text, fontWeight: 600 }}>{icon} {label}</span>
        <span style={{ fontSize: 13, color, fontWeight: 700 }}>{safeScore}/{safeMax}</span>
      </div>
      <div style={{ background: "rgba(255,255,255,0.06)", borderRadius: 6, height: 8 }}>
        <div style={{ background: color, width: `${pct}%`, height: 8, borderRadius: 6, transition: "width 1s ease" }} />
      </div>
    </div>
  );
}

// ── Insight card ──────────────────────────────────────────────────
function InsightCard({ insight }) {
  const statusColor = {
    improved: C.accent2, worsened: C.danger, watch: C.warn, stable: C.muted
  }[insight.status] || C.muted;

  const arrow = insight.direction === "up" ? "↑" : "↓";

  return (
    <div style={{
      background: statusColor + "15", border: `1px solid ${statusColor}44`,
      borderLeft: `3px solid ${statusColor}`, borderRadius: 10,
      padding: "12px 16px", marginBottom: 10,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{insight.label}</span>
        <span style={{ fontSize: 13, fontWeight: 800, color: statusColor }}>{arrow} {insight.pct_change ? `${Math.abs(insight.pct_change)}%` : ""}</span>
      </div>
      <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.5 }}>{insight.sentence}</div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
//  MAIN PAGE
// ═══════════════════════════════════════════════════════════════════
export default function HealthScorePage({ patients }) {
  const [selPatient, setSelPatient] = useState("");
  const [score, setScore]           = useState(null);
  const [explain, setExplain]       = useState(null);
  const [history, setHistory]       = useState([]);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState("");
  const [activeTab, setActiveTab]   = useState("score");

  async function loadData(patientId) {
    if (!patientId) return;
    setLoading(true); setError("");
    try {
      const [sRes, eRes, hRes] = await Promise.all([
        healthScoreAPI.getScore(patientId),
        healthScoreAPI.explain(patientId),
        healthScoreAPI.getHistory(patientId, 30),
      ]);
      setScore(sRes.data);
      setExplain(eRes.data);
      setHistory(hRes.data.history || []);
    } catch (e) {
      setError(e.response?.data?.detail || "Could not load health score");
    }
    setLoading(false);
  }

  function handlePatientChange(e) {
    setSelPatient(e.target.value);
    loadData(e.target.value);
  }

  const tabs = [
    { id: "score",   label: "Score"   },
    { id: "explain", label: "Explain" },
    { id: "history", label: "History" },
  ];

  return (
    <div style={{ fontFamily: "'Segoe UI', sans-serif", color: C.text }}>
      <h2 style={{ margin: "0 0 6px", fontSize: 22 }}>💯 Health Score</h2>
      <p style={{ color: C.muted, fontSize: 14, marginBottom: 20 }}>
        Daily health score based on vitals, alerts and symptoms.
      </p>

      {/* ── Patient selector ── */}
      <select value={selPatient} onChange={handlePatientChange}
        style={{
          width: "100%", padding: "10px 16px", borderRadius: 10,
          background: "rgba(59,201,232,0.07)", border: `1px solid ${C.border}`,
          color: C.text, fontSize: 14, outline: "none",
          boxSizing: "border-box", marginBottom: 20,
        }}>
        <option value="">— Select a patient —</option>
        {(patients || []).map(p => (
          <option key={p.patient_id} value={p.patient_id}>{p.name} ({p.patient_id})</option>
        ))}
      </select>

      {!selPatient && (
        <div style={{ color: C.muted, textAlign: "center", padding: 60 }}>
          Select a patient to view their health score
        </div>
      )}

      {loading && (
        <div style={{ color: C.accent, textAlign: "center", padding: 40 }}>
          Calculating health score...
        </div>
      )}

      {error && (
        <div style={{ color: C.danger, padding: 16, background: "rgba(255,77,109,0.1)", borderRadius: 10, marginBottom: 16 }}>
          ⚠️ {error}
        </div>
      )}

      {score && !loading && (
        <>
          {/* ── Tab bar ── */}
          <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
            {tabs.map(t => (
              <button key={t.id} onClick={() => setActiveTab(t.id)}
                style={{
                  flex: 1, padding: "10px", borderRadius: 10, border: "none",
                  background: activeTab === t.id ? C.accent : "rgba(59,201,232,0.08)",
                  color: activeTab === t.id ? C.bg : C.muted,
                  fontWeight: 600, fontSize: 14, cursor: "pointer",
                }}>
                {t.label}
              </button>
            ))}
          </div>

          {/* ── SCORE TAB ── */}
          {activeTab === "score" && (
            <div>
              <div style={{
                background: C.card, border: `1px solid ${C.border}`,
                borderRadius: 16, padding: 24, marginBottom: 16, textAlign: "center",
              }}>
                <ScoreRing score={score.total} grade={score.grade} />
                <div style={{ marginTop: 16, fontSize: 20, fontWeight: 700, color: gradeColor(score.grade) }}>
                  {score.grade}
                </div>
                <div style={{ color: C.muted, fontSize: 13, marginTop: 6 }}>
                  {scoreSummaryText(score.grade)}
                </div>
              </div>

              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 20 }}>
                <h4 style={{ margin: "0 0 16px", color: C.accent, fontSize: 15 }}>Category Breakdown</h4>
                {(score.categories || []).map((cat, i) => (
                  <CategoryBar key={i}
                    label={cat.label}
                    score={cat.score}
                    max={cat.max}
                    color={categoryColor(cat.score, cat.max)}
                    icon={cat.icon || "📊"}
                  />
                ))}
              </div>
            </div>
          )}

          {/* ── EXPLAIN TAB ── */}
          {activeTab === "explain" && (
            <ExplainMyHealth
              embedded
              patientId={selPatient}
              data={explain}
              loading={loading}
              error={error}
            />
          )}

          {/* ── HISTORY TAB ── */}
          {activeTab === "history" && (
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 20 }}>
              <h4 style={{ margin: "0 0 16px", color: C.accent, fontSize: 15 }}>📅 30-Day History</h4>
              {history.length === 0 ? (
                <div style={{ color: C.muted, textAlign: "center", padding: 30 }}>
                  No history data available yet.
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {[...history].reverse().map((day, i) => (
                    <div key={i} style={{
                      display: "flex", justifyContent: "space-between", alignItems: "center",
                      padding: "12px 0", borderBottom: `1px solid ${C.border}`,
                    }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{day.date}</div>
                        <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{day.grade}</div>
                      </div>
                      <div style={{
                        fontSize: 20, fontWeight: 800,
                        color: gradeColor(day.grade),
                      }}>{day.total}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}