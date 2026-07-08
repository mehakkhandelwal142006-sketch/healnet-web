import { useState, useEffect } from "react";
import { healthScoreAPI } from "../services/api";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, RadarChart, Radar,
  PolarGrid, PolarAngleAxis, PolarRadiusAxis,
} from "recharts";
import SmartAlertsTab from "../services/SmartAlertsTab";

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

function useWindowWidth() {
  const [w, setW] = useState(window.innerWidth);
  useEffect(() => {
    const h = () => setW(window.innerWidth);
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, []);
  return w;
}

function Card({ children, style = {} }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 24, ...style }}>
      {children}
    </div>
  );
}

function gradeColor(grade) {
  switch (grade) {
    case "Excellent": return C.accent2;
    case "Good":      return C.accent;
    case "Fair":      return C.warn;
    case "Poor":      return "#f97316";
    case "Critical":  return C.danger;
    default:          return C.muted;
  }
}

// ── SVG arc gauge ────────────────────────────────────────────────
// ── SVG arc gauge ────────────────────────────────────────────────
function ScoreGauge({ total, max = 100, grade }) {
  const pct = Math.max(0, Math.min(1, total / max));
  const R = 80, cx = 110, cy = 100;
  const color = gradeColor(grade);
  const angle = Math.PI + pct * Math.PI;
  const fx = cx + R * Math.cos(angle);
  const fy = cy + R * Math.sin(angle);
  const fgPath = pct <= 0 ? "" : `M ${cx - R} ${cy} A ${R} ${R} 0 0 1 ${fx} ${fy}`;

  return (
    <svg viewBox="0 0 220 120" style={{ width: "100%", maxWidth: 260, display: "block", margin: "0 auto" }}>
      <path d={`M ${cx - R} ${cy} A ${R} ${R} 0 1 1 ${cx + R} ${cy}`} fill="none" stroke={C.border} strokeWidth={14} strokeLinecap="round" />
      {fgPath && <path d={fgPath} fill="none" stroke={color} strokeWidth={14} strokeLinecap="round" style={{ filter: `drop-shadow(0 0 6px ${color}88)` }} />}
      <text x={cx} y={cy - 8} textAnchor="middle" fill={color} fontSize="36" fontWeight="800" fontFamily="'Segoe UI', sans-serif">{total}</text>
      <text x={cx} y={cy + 14} textAnchor="middle" fill={C.muted} fontSize="11" fontFamily="'Segoe UI', sans-serif">out of {max}</text>
      <text x={cx} y={cy + 32} textAnchor="middle" fill={color} fontSize="14" fontWeight="700" fontFamily="'Segoe UI', sans-serif">{grade}</text>
    </svg>
  );
}

// ── Category bar card ────────────────────────────────────────────
function CategoryCard({ cat }) {
  const pct = cat.score / cat.max;
  const color = pct >= 0.8 ? C.accent2 : pct >= 0.5 ? C.accent : pct >= 0.3 ? C.warn : C.danger;
  return (
    <Card style={{ padding: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
        <span style={{ fontWeight: 700, fontSize: 13, color: C.text }}>{cat.label}</span>
        <span style={{ fontWeight: 800, fontSize: 15, color }}>
          {cat.score}<span style={{ color: C.muted, fontSize: 11 }}>/{cat.max}</span>
        </span>
      </div>
      <div style={{ background: "rgba(59,201,232,0.08)", borderRadius: 6, height: 7, marginBottom: 8 }}>
        <div style={{ width: `${Math.round(pct * 100)}%`, height: "100%", borderRadius: 6, background: color, transition: "width 0.8s ease", boxShadow: `0 0 8px ${color}66` }} />
      </div>
      <div style={{ fontSize: 11, color: C.muted, lineHeight: 1.4 }}>
        {cat.has_data ? cat.detail : `⚠️ ${cat.detail}`}
      </div>
    </Card>
  );
}

// ── Insight card ─────────────────────────────────────────────────
function InsightCard({ insight }) {
  const statusColor = {
    improved: C.accent2,
    worsened: C.danger,
    watch:    C.warn,
    stable:   C.muted,
  }[insight.status] || C.muted;

  const arrow = insight.direction === "up" ? "↑" : "↓";
  const arrowColor = insight.status === "improved"
    ? C.accent2
    : insight.status === "worsened"
    ? C.danger
    : C.warn;

  return (
    <div style={{
      display: "flex", alignItems: "flex-start", gap: 14,
      padding: "14px 0", borderBottom: `1px solid ${C.border}44`,
    }}>
      {/* Arrow indicator */}
      <div style={{
        width: 36, height: 36, borderRadius: "50%", flexShrink: 0,
        background: arrowColor + "18", border: `1px solid ${arrowColor}44`,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 18, fontWeight: 800, color: arrowColor,
      }}>
        {arrow}
      </div>

      <div style={{ flex: 1 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 6 }}>
          <span style={{ fontWeight: 700, fontSize: 14, color: C.text }}>{insight.label}</span>
          <span style={{
            background: statusColor + "18", color: statusColor,
            border: `1px solid ${statusColor}44`,
            borderRadius: 6, padding: "2px 10px", fontSize: 11, fontWeight: 700,
          }}>
            {insight.status.toUpperCase()}
          </span>
        </div>
        <div style={{ fontSize: 13, color: C.muted, marginTop: 4, lineHeight: 1.5 }}>
          {insight.sentence}
        </div>
        <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>
          Last week: <strong style={{ color: C.text }}>{insight.old_value} {insight.unit}</strong>
          &nbsp;→&nbsp;
          This week: <strong style={{ color: statusColor }}>{insight.new_value} {insight.unit}</strong>
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
//  MAIN PAGE
// ════════════════════════════════════════════════════════════════════
export default function HealthScorePage({ patientId, patientName }) {
  const [score,   setScore]   = useState(null);
  const [history, setHistory] = useState([]);
  const [explain, setExplain] = useState(null);
  const [loading, setLoading] = useState(true);
  const [explainLoading, setExplainLoading] = useState(false);
  const [error,   setError]   = useState("");
  const [view,    setView]    = useState("score");

  const width  = useWindowWidth();
  const mobile = width < 768;

  useEffect(() => {
    if (!patientId) return;
    setLoading(true); setError("");
    Promise.all([
      healthScoreAPI.getScore(patientId),
      healthScoreAPI.getHistory(patientId, 30),
    ])
      .then(([sRes, hRes]) => {
        setScore(sRes.data);
        setHistory(hRes.data.history || []);
      })
      .catch(() => setError("Could not load health score. Check your connection."))
      .finally(() => setLoading(false));
  }, [patientId]);

  // Load explain lazily only when tab is clicked
  async function loadExplain() {
    if (explain || explainLoading) return;
    setExplainLoading(true);
    try {
      const res = await healthScoreAPI.explain(patientId);
      setExplain(res.data);
    } catch {
      setExplain({ error: "Could not load health explanation. Try again later." });
    }
    setExplainLoading(false);
  }

  function handleTabChange(tab) {
    setView(tab);
    if (tab === "explain") loadExplain();
  }

  if (loading) return <div style={{ color: C.muted, textAlign: "center", padding: 80 }}>Calculating health score...</div>;
  if (error)   return <div style={{ color: C.danger, textAlign: "center", padding: 80 }}>{error}</div>;
  if (!score)  return null;

  const radarData = score.categories.map(c => ({
    subject: c.label.split(" ")[0],
    score: c.score, max: c.max, fullMark: c.max,
  }));

  const color = gradeColor(score.grade);

  const tabs = [
    { id: "score",   label: "📊 Score"   },
    { id: "explain", label: "💡 Explain" },
    { id: "trend",   label: "📈 Trend"   },
    { id: "radar",   label: "🕸 Radar"   },
    { id: "alerts",  label: "🚨 Smart Alerts" },
  ];

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ margin: "0 0 4px", fontSize: mobile ? 18 : 22 }}>📊 Health Score</h2>
        <p style={{ color: C.muted, fontSize: 13, margin: 0 }}>
          {patientName} · Last updated {new Date(score.computed_at).toLocaleTimeString()}
          {!score.wearable_connected && (
            <span style={{ marginLeft: 10, color: C.warn, fontSize: 11,
              background: "rgba(255,209,102,0.1)", border: "1px solid rgba(255,209,102,0.3)",
              borderRadius: 6, padding: "2px 8px" }}>
              ⌚ No wearable — Activity & Sleep scores are estimated
            </span>
          )}
        </p>
      </div>

      {/* Tab toggle */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
        {tabs.map(({ id, label }) => (
          <button key={id} onClick={() => handleTabChange(id)}
            style={{ padding: "8px 16px", borderRadius: 20, border: `1px solid ${C.border}`,
              background: view === id ? C.accent : "transparent",
              color: view === id ? C.bg : C.muted,
              cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
            {label}
          </button>
        ))}
      </div>

      {/* ── SCORE VIEW ─────────────────────────────────────────── */}
      {view === "score" && (
        <div style={{ display: "grid", gridTemplateColumns: mobile ? "1fr" : "280px 1fr", gap: 20 }}>
          <Card style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: 24 }}>
            <ScoreGauge total={score.total} max={score.max} grade={score.grade} />
            <div style={{ marginTop: 16, textAlign: "center", width: "100%" }}>
              <div style={{ fontSize: 12, color: C.muted, marginBottom: 8 }}>Score Breakdown</div>
              {score.categories.map(c => (
                <div key={c.label} style={{ display: "flex", justifyContent: "space-between", gap: 20, fontSize: 12, color: C.muted, marginBottom: 4 }}>
                  <span>{c.label}</span>
                  <span style={{ color: C.text, fontWeight: 600 }}>{c.score}/{c.max}</span>
                </div>
              ))}
            </div>
          </Card>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {score.categories.map(c => <CategoryCard key={c.label} cat={c} />)}
          </div>
        </div>
      )}

      {/* ── EXPLAIN VIEW ───────────────────────────────────────── */}
      {view === "explain" && (
        <div>
          {explainLoading ? (
            <div style={{ color: C.muted, textAlign: "center", padding: 60 }}>
              Comparing this week vs last week...
            </div>
          ) : explain?.error ? (
            <div style={{ color: C.danger, textAlign: "center", padding: 60 }}>{explain.error}</div>
          ) : explain ? (
            <div>
              {/* Summary banner */}
              <div style={{
                background: "rgba(59,201,232,0.06)", border: `1px solid ${C.border}`,
                borderRadius: 14, padding: "18px 22px", marginBottom: 24,
              }}>
                <div style={{ fontSize: 13, color: C.muted, marginBottom: 6, fontWeight: 700, letterSpacing: 0.5 }}>
                  THIS WEEK VS LAST WEEK
                </div>
                <div style={{ fontSize: 16, color: C.text, fontWeight: 600, lineHeight: 1.5 }}>
                  {explain.summary}
                </div>
                <div style={{ display: "flex", gap: 20, marginTop: 14, flexWrap: "wrap" }}>
                  {[
                    { label: "Last Week Score", value: explain.last_week_score },
                    { label: "This Week Score", value: explain.this_week_score },
                    { label: "Change", value: (explain.this_week_score - explain.last_week_score > 0 ? "+" : "") + (explain.this_week_score - explain.last_week_score) },
                  ].map(({ label, value }) => (
                    <div key={label} style={{ textAlign: "center", background: "rgba(59,201,232,0.04)", border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 18px" }}>
                      <div style={{ fontSize: 10, color: C.muted, marginBottom: 4 }}>{label}</div>
                      <div style={{ fontSize: 22, fontWeight: 800, color: label === "Change"
                        ? (explain.this_week_score >= explain.last_week_score ? C.accent2 : C.danger)
                        : C.accent }}>
                        {value}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Insight cards */}
              {!explain.has_data ? (
                <div style={{ color: C.muted, textAlign: "center", padding: 40 }}>
                  Not enough data yet — record more vitals this week to see a comparison.
                </div>
              ) : explain.insights.length === 0 ? (
                <Card>
                  <div style={{ color: C.muted, textAlign: "center", padding: 20 }}>
                    ✅ No significant changes detected this week — all indicators are stable.
                  </div>
                </Card>
              ) : (
                <Card style={{ padding: "8px 24px" }}>
                  <div style={{ fontSize: 12, color: C.muted, fontWeight: 700, letterSpacing: 0.5, padding: "12px 0 8px" }}>
                    {explain.insights.length} CHANGE{explain.insights.length !== 1 ? "S" : ""} DETECTED
                  </div>
                  {explain.insights.map((ins, i) => (
                    <InsightCard key={i} insight={ins} />
                  ))}
                </Card>
              )}
            </div>
          ) : null}
        </div>
      )}

      {/* ── TREND VIEW ─────────────────────────────────────────── */}
      {view === "trend" && (
        <Card>
          <h3 style={{ margin: "0 0 20px", color: C.accent, fontSize: 15 }}>30-Day Health Score Trend</h3>
          {history.length < 2 ? (
            <div style={{ color: C.muted, textAlign: "center", padding: 40 }}>
              Not enough historical data yet — check back after a few days of vitals.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={history}>
                <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
                <XAxis dataKey="date" tickFormatter={d => { const dt = new Date(d); return `${dt.getDate()}/${dt.getMonth() + 1}`; }} stroke={C.muted} tick={{ fontSize: 10 }} />
                <YAxis domain={[0, 100]} stroke={C.muted} tick={{ fontSize: 10 }} />
                <Tooltip contentStyle={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 12 }}
                  formatter={(val, name) => [`${val}`, name]} labelFormatter={d => new Date(d).toLocaleDateString()} />
                <Line type="monotone" dataKey="total" stroke={C.accent} strokeWidth={2.5} dot={{ r: 4, fill: C.accent }} name="Total Score" />
                <Line type="monotone" dataKey="categories.Heart Health" stroke={C.danger} strokeWidth={1.5} dot={false} name="Heart Health" strokeDasharray="4 2" />
                <Line type="monotone" dataKey="categories.Sleep" stroke="#a78bfa" strokeWidth={1.5} dot={false} name="Sleep" strokeDasharray="4 2" />
                <Line type="monotone" dataKey="categories.Activity" stroke={C.accent2} strokeWidth={1.5} dot={false} name="Activity" strokeDasharray="4 2" />
              </LineChart>
            </ResponsiveContainer>
          )}
          {history.length >= 2 && (
            <div style={{ marginTop: 16, display: "flex", gap: 12, flexWrap: "wrap" }}>
              {[
                { label: "Latest", value: history[history.length - 1]?.total },
                { label: "Best",   value: Math.max(...history.map(h => h.total)) },
                { label: "Worst",  value: Math.min(...history.map(h => h.total)) },
                { label: "Avg",    value: Math.round(history.reduce((s, h) => s + h.total, 0) / history.length) },
              ].map(({ label, value }) => (
                <div key={label} style={{ background: "rgba(59,201,232,0.06)", border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 16px", textAlign: "center" }}>
                  <div style={{ color: C.muted, fontSize: 11 }}>{label}</div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: gradeColor(value >= 85 ? "Excellent" : value >= 70 ? "Good" : value >= 55 ? "Fair" : "Poor") }}>{value}</div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* ── RADAR VIEW ─────────────────────────────────────────── */}
      {view === "radar" && (
        <Card>
          <h3 style={{ margin: "0 0 20px", color: C.accent, fontSize: 15 }}>Health Category Radar</h3>
          <ResponsiveContainer width="100%" height={320}>
            <RadarChart data={radarData}>
              <PolarGrid stroke={C.border} />
              <PolarAngleAxis dataKey="subject" tick={{ fill: C.muted, fontSize: 12 }} />
              <PolarRadiusAxis angle={90} domain={[0, "auto"]} tick={{ fill: C.muted, fontSize: 9 }} />
              <Radar name="Score" dataKey="score" stroke={color} fill={color} fillOpacity={0.25} strokeWidth={2} />
              <Tooltip contentStyle={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 12 }}
                formatter={(val, _, props) => [`${val}/${props.payload.max}`, props.payload.subject]} />
            </RadarChart>
          </ResponsiveContainer>
          <div style={{ display: "grid", gridTemplateColumns: mobile ? "1fr 1fr" : "repeat(5, 1fr)", gap: 10, marginTop: 16 }}>
            {score.categories.map(c => {
              const pct = c.score / c.max;
              const col = pct >= 0.8 ? C.accent2 : pct >= 0.5 ? C.accent : pct >= 0.3 ? C.warn : C.danger;
              return (
                <div key={c.label} style={{ textAlign: "center", background: "rgba(59,201,232,0.04)", border: `1px solid ${C.border}`, borderRadius: 10, padding: 12 }}>
                  <div style={{ fontSize: 10, color: C.muted, marginBottom: 4 }}>{c.label}</div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: col }}>{c.score}</div>
                  <div style={{ fontSize: 10, color: C.muted }}>/ {c.max}</div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* ── SMART ALERTS VIEW ─────────────────────────────────── */}
      {view === "alerts" && (
        <SmartAlertsTab patientId={patientId} />
      )}
    </div>
  );
}
