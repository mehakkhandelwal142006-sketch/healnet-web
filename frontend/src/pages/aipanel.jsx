import { useState, useEffect } from "react";
import { aiAPI } from "../services/api";

const C = {
  bg: "#030c2c", card: "#04163c", border: "rgba(59,201,232,0.18)",
  accent: "#3BC9E8", accent2: "#00f5a0", danger: "#ff4d6d",
  warn: "#ffd166", text: "#e8f4f8", muted: "rgba(232,244,248,0.5)",
};
const css = (s) => s;

// ── Risk Gauge SVG ────────────────────────────────────────────────
function RiskGauge({ score, label, color }) {
  const pct = score / 100;
  const angle = 180 - pct * 180;
  const rad = (angle * Math.PI) / 180;
  const cx = 90, cy = 80, r = 65;
  const nx = cx + r * Math.cos(rad);
  const ny = cy - r * Math.sin(rad);
  const nlen = 52;
  const nx2 = cx + nlen * Math.cos(rad);
  const ny2 = cy - nlen * Math.sin(rad);

  return (
    <div style={{ textAlign: "center" }}>
      <svg viewBox="0 0 180 100" width="200" height="110">
        <defs>
          <linearGradient id="rg" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%"   stopColor="#00a860" />
            <stop offset="40%"  stopColor="#cc8800" />
            <stop offset="70%"  stopColor="#b07800" />
            <stop offset="100%" stopColor="#b01030" />
          </linearGradient>
        </defs>
        <path d={`M ${cx - r},${cy} A ${r},${r} 0 0,1 ${cx + r},${cy}`}
          fill="none" stroke="rgba(180,200,230,0.2)" strokeWidth="10" strokeLinecap="round" />
        <path d={`M ${cx - r},${cy} A ${r},${r} 0 0,1 ${nx.toFixed(2)},${ny.toFixed(2)}`}
          fill="none" stroke="url(#rg)" strokeWidth="10" strokeLinecap="round" />
        <line x1={cx} y1={cy} x2={nx2.toFixed(2)} y2={ny2.toFixed(2)}
          stroke={color} strokeWidth="2.5" strokeLinecap="round" />
        <circle cx={cx} cy={cy} r="5" fill={color} stroke="#fff" strokeWidth="1.5" />
        <text x={cx} y={cy - 8} fontSize="18" fill={color} fontWeight="800"
          textAnchor="middle">{score}%</text>
        <text x="24" y="98" fontSize="8" fill="#00a860" fontWeight="700">LOW</text>
        <text x="142" y="98" fontSize="8" fill="#b01030" fontWeight="700">HIGH</text>
      </svg>
      <div style={css({ fontSize: 12, fontWeight: 800, color, textTransform: "uppercase", letterSpacing: 2 })}>
        {label}
      </div>
    </div>
  );
}

// ── Recommendation card ───────────────────────────────────────────
function RecCard({ icon, message }) {
  const colorMap = {
    "🆘": C.danger, "🚨": C.danger, "🔴": C.warn, "🟡": "#fbbf24", "✅": C.accent2,
  };
  const color = colorMap[icon] || C.muted;
  return (
    <div style={css({
      background: color + "15", border: `1px solid ${color}44`,
      borderLeft: `3px solid ${color}`, borderRadius: 10,
      padding: "12px 16px", marginBottom: 10,
      display: "flex", gap: 10, alignItems: "flex-start",
    })}>
      <span style={{ fontSize: 18 }}>{icon}</span>
      <span style={css({ color: C.text, fontSize: 14, lineHeight: 1.5 })}>{message}</span>
    </div>
  );
}

// ── Breakdown table row ───────────────────────────────────────────
function BreakdownRow({ vital, level, score, max_score, pct }) {
  const levelColor = {
    CRITICAL: C.danger, HIGH: C.warn, MODERATE: "#fbbf24",
    LOW: C.accent, NORMAL: C.accent2
  }[level] || C.muted;

  return (
    <div style={css({
      display: "grid", gridTemplateColumns: "160px 90px 1fr 80px",
      gap: 12, padding: "10px 0",
      borderBottom: `1px solid ${C.border}`,
      alignItems: "center",
    })}>
      <div style={css({ fontWeight: 600, fontSize: 13 })}>{vital}</div>
      <div>
        <span style={css({
          background: levelColor + "22", color: levelColor,
          border: `1px solid ${levelColor}44`, borderRadius: 6,
          padding: "2px 8px", fontSize: 11, fontWeight: 700,
        })}>{level}</span>
      </div>
      <div style={css({ background: "rgba(255,255,255,0.06)", borderRadius: 4, height: 8 })}>
        <div style={css({ background: levelColor, width: `${pct}%`, height: 8, borderRadius: 4, transition: "width 0.8s ease" })} />
      </div>
      <div style={css({ color: levelColor, fontSize: 12, fontWeight: 700, textAlign: "right" })}>
        {score} / {max_score}
      </div>
    </div>
  );
}

// ── MAIN COMPONENT ─────────────────────────────────────────────────
export default function AIPanel({ patientId }) {
  const [data, setData]           = useState(null);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState("");
  const [showBreakdown, setShowBreakdown] = useState(false);

  useEffect(() => {
    if (patientId) fetchAI();
  }, [patientId]);

  async function fetchAI() {
    setLoading(true); setError("");
    try {
      const res = await aiAPI.analyze(patientId);
      setData(res.data);
    } catch (e) {
      setError(e.response?.data?.detail || "Could not load AI analysis");
    }
    setLoading(false);
  }

  if (loading) return (
    <div style={css({ textAlign: "center", color: C.muted, padding: 40 })}>
      🤖 Running AI analysis...
    </div>
  );

  if (error) return (
    <div style={css({ color: C.danger, padding: 20, textAlign: "center" })}>⚠️ {error}</div>
  );

  if (!data) return null;

  return (
    <div style={css({
      background: C.card, border: `1px solid ${C.border}`,
      borderRadius: 16, padding: 24,
    })}>
      <div style={css({ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 })}>
        <h3 style={css({ margin: 0, color: C.accent, fontSize: 18 })}>🤖 AI Predictive Insights</h3>
        <button onClick={fetchAI}
          style={css({
            padding: "6px 14px", borderRadius: 8, border: `1px solid ${C.border}`,
            background: "none", color: C.muted, cursor: "pointer", fontSize: 12,
          })}>
          ↻ Refresh
        </button>
      </div>

      {/* ── Top row: Gauge + Summary ─────────────────────────────── */}
      <div style={css({ display: "grid", gridTemplateColumns: "220px 1fr", gap: 20, marginBottom: 24 })}>
        <div style={css({
          background: "rgba(59,201,232,0.05)", borderRadius: 12,
          padding: 16, display: "flex", alignItems: "center", justifyContent: "center",
        })}>
          <RiskGauge score={data.risk_score} label={data.risk_label} color={data.risk_color} />
        </div>

        <div style={css({
          background: "rgba(59,201,232,0.05)", borderRadius: 12, padding: 20,
        })}>
          <div style={css({ fontSize: 11, color: C.muted, letterSpacing: 2, marginBottom: 8 })}>
            AI RISK ASSESSMENT
          </div>
          <div style={css({ fontSize: 36, fontWeight: 800, color: data.risk_color, marginBottom: 8 })}>
            {data.risk_score}%
            <span style={css({ fontSize: 14, marginLeft: 10, color: data.risk_color })}>
              {data.risk_label}
            </span>
          </div>
          <div style={css({ color: C.muted, fontSize: 13, lineHeight: 1.6 })}>
            Composite score from <strong style={{ color: C.text }}>{data.vitals_count}</strong> vital signs
            using weighted rule-based analysis.<br />
            Based on <strong style={{ color: C.text }}>{data.alerts_count}</strong> alert(s) logged for this patient.
          </div>
        </div>
      </div>

      {/* ── Trends ───────────────────────────────────────────────── */}
      <div style={css({ marginBottom: 24 })}>
        <h4 style={css({ color: C.text, margin: "0 0 12px", fontSize: 15 })}>📊 Trend Analysis</h4>
        {data.trends.length === 0 ? (
          <div style={css({ color: C.muted, fontSize: 13, padding: "12px 0" })}>
            Not enough history to detect trends yet.
          </div>
        ) : (
          <div style={css({ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12 })}>
            {data.trends.map((t, i) => (
              <div key={i} style={css({
                background: t.color + "22", border: `1px solid ${t.color}44`,
                borderRadius: 10, padding: 14,
              })}>
                <div style={css({ fontSize: 11, color: C.muted, marginBottom: 4 })}>{t.vital}</div>
                <div style={css({ fontWeight: 700, color: t.color, marginBottom: 6 })}>
                  {t.trend === "Worsening" ? "📈" : t.trend === "Watch" ? "⚠️" : "📉"} {t.trend}
                </div>
                <div style={css({ fontSize: 12, color: C.muted, lineHeight: 1.4 })}>{t.note}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Recommendations ──────────────────────────────────────── */}
      <div style={css({ marginBottom: 24 })}>
        <h4 style={css({ color: C.text, margin: "0 0 12px", fontSize: 15 })}>💡 AI Recommendations</h4>
        {data.recommendations.map((r, i) => (
          <RecCard key={i} icon={r.icon} message={r.message} />
        ))}
      </div>

      {/* ── Breakdown Table ──────────────────────────────────────── */}
      <div>
        <button onClick={() => setShowBreakdown(!showBreakdown)}
          style={css({
            background: "none", border: `1px solid ${C.border}`,
            color: C.muted, padding: "8px 16px", borderRadius: 8,
            cursor: "pointer", fontSize: 13, width: "100%",
          })}>
          {showBreakdown ? "▲ Hide" : "▼ View"} AI Scoring Breakdown
        </button>

        {showBreakdown && (
          <div style={css({ marginTop: 16 })}>
            <div style={css({
              display: "grid", gridTemplateColumns: "160px 90px 1fr 80px",
              gap: 12, padding: "8px 0",
              borderBottom: `1px solid ${C.border}`,
            })}>
              {["Vital", "Status", "Risk Bar", "Score"].map(h => (
                <div key={h} style={css({ fontSize: 11, color: C.muted, fontWeight: 700, letterSpacing: 1 })}>{h}</div>
              ))}
            </div>
            {data.breakdown.map((row, i) => (
              <BreakdownRow key={i} {...row} />
            ))}
            <div style={css({
              textAlign: "right", padding: "12px 0",
              fontSize: 14, fontWeight: 800, color: data.risk_color,
            })}>
              Total Risk: {data.risk_score}% — {data.risk_label}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
