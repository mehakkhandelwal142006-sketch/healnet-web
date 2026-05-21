import { useState, useRef } from "react";
import { smartwatchAPI } from "../services/api";
import {
  LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from "recharts";

const C = {
  bg: "#030c2c", card: "#04163c", border: "rgba(59,201,232,0.18)",
  accent: "#3BC9E8", accent2: "#00f5a0", danger: "#ff4d6d",
  warn: "#ffd166", text: "#e8f4f8", muted: "rgba(232,244,248,0.5)",
};

// ── Stat card ─────────────────────────────────────────────────────
function StatCard({ icon, label, value, unit, color }) {
  return (
    <div style={{
      background: C.card, border: `1px solid ${color}44`,
      borderRadius: 14, padding: 16, textAlign: "center",
    }}>
      <div style={{ fontSize: 24, marginBottom: 6 }}>{icon}</div>
      <div style={{ fontSize: 11, color: C.muted, letterSpacing: 1, marginBottom: 4 }}>{label}</div>
      {value !== null && value !== undefined ? (
        <>
          <div style={{ fontSize: 28, fontWeight: 800, color }}>{value}</div>
          <div style={{ fontSize: 11, color: C.muted }}>{unit}</div>
        </>
      ) : (
        <div style={{ fontSize: 18, color: C.muted }}>—</div>
      )}
    </div>
  );
}

// ── Chart wrapper ─────────────────────────────────────────────────
function VitalChart({ data, xKey, yKey, label, color, type = "line" }) {
  if (!data || data.length === 0) return (
    <div style={{ color: C.muted, textAlign: "center", padding: 40, fontSize: 13 }}>
      No {label} data found in CSV
    </div>
  );

  return (
    <ResponsiveContainer width="100%" height={200}>
      {type === "bar" ? (
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
          <XAxis dataKey={xKey} stroke={C.muted} tick={{ fontSize: 10 }}
            tickFormatter={v => v?.slice(5)} />
          <YAxis stroke={C.muted} tick={{ fontSize: 10 }} />
          <Tooltip contentStyle={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 12 }} />
          <Bar dataKey={yKey} fill={color} radius={[4, 4, 0, 0]} name={label} />
        </BarChart>
      ) : (
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
          <XAxis dataKey={xKey} stroke={C.muted} tick={{ fontSize: 10 }}
            tickFormatter={v => v?.slice(5)} />
          <YAxis stroke={C.muted} tick={{ fontSize: 10 }} />
          <Tooltip contentStyle={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 12 }} />
          <Line type="monotone" dataKey={yKey} stroke={color} dot={false} strokeWidth={2} name={label} />
        </LineChart>
      )}
    </ResponsiveContainer>
  );
}

// ═══════════════════════════════════════════════════════════════════
//  MAIN PAGE
// ═══════════════════════════════════════════════════════════════════
export default function SmartWatchPage() {
  const [tab, setTab]         = useState("csv"); // csv | googlefit
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");
  const [result, setResult]   = useState(null);
  const [activeChart, setActiveChart] = useState("heart_rate");
  const fileRef = useRef();

  // ── CSV Upload ─────────────────────────────────────────────────
  async function handleCSV(e) {
    const file = e.target.files[0];
    if (!file) return;
    setLoading(true); setError(""); setResult(null);
    try {
      const res = await smartwatchAPI.uploadCSV(file);
      setResult(res.data);
    } catch (err) {
      setError(err.response?.data?.detail || "Failed to parse CSV");
    }
    setLoading(false);
  }

  const charts = [
    { key: "heart_rate", label: "❤️ Heart Rate", yKey: "heart_rate", unit: "bpm",   color: C.danger,  type: "line" },
    { key: "steps",      label: "🚶 Steps",       yKey: "steps",      unit: "steps", color: C.accent2, type: "bar"  },
    { key: "spo2",       label: "🫁 SpO2",         yKey: "spo2",       unit: "%",     color: C.accent,  type: "line" },
    { key: "sleep",      label: "😴 Sleep",        yKey: "sleep_hours",unit: "hrs",   color: "#9b59b6", type: "bar"  },
    { key: "calories",   label: "🔥 Calories",     yKey: "calories",   unit: "kcal",  color: C.warn,    type: "bar"  },
  ];

  return (
    <div style={{ fontFamily: "'Segoe UI', sans-serif", color: C.text }}>
      <h2 style={{ margin: "0 0 6px", fontSize: 22 }}>⌚ Smartwatch Data</h2>
      <p style={{ color: C.muted, fontSize: 14, marginBottom: 24 }}>
        Upload CSV from your smartwatch or connect Google Fit for automatic sync.
      </p>

      {/* ── Tab selector ─────────────────────────────────────────── */}
      <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
        {[
          { id: "csv",       label: "📂 Upload CSV" },
          { id: "googlefit", label: "🏃 Google Fit" },
        ].map(t => (
          <button key={t.id} onClick={() => { setTab(t.id); setResult(null); setError(""); }}
            style={{
              padding: "10px 20px", borderRadius: 10, border: "none",
              background: tab === t.id ? C.accent : "rgba(59,201,232,0.08)",
              color: tab === t.id ? C.bg : C.muted,
              fontWeight: 600, fontSize: 14, cursor: "pointer",
            }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ══ CSV TAB ══════════════════════════════════════════════════ */}
      {tab === "csv" && (
        <div>
          {/* How to export guide */}
          <div style={{
            background: "rgba(59,201,232,0.04)", border: `1px solid ${C.border}`,
            borderRadius: 14, padding: 20, marginBottom: 20,
          }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.accent, marginBottom: 12 }}>
              📖 How to export data from your smartwatch
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, fontSize: 13, color: C.muted, lineHeight: 1.8 }}>
              <div>
                <div style={{ color: C.text, fontWeight: 600, marginBottom: 4 }}>🍎 Apple Health</div>
                Open Health app → Tap profile → Export All Health Data → Upload CSV
                <br /><br />
                <div style={{ color: C.text, fontWeight: 600, marginBottom: 4 }}>📱 Samsung Health</div>
                Samsung Health → Settings → Download personal data → Upload CSV
              </div>
              <div>
                <div style={{ color: C.text, fontWeight: 600, marginBottom: 4 }}>🏃 Fitbit</div>
                fitbit.com → Settings → Export Account Archive → Upload CSV
                <br /><br />
                <div style={{ color: C.text, fontWeight: 600, marginBottom: 4 }}>🤖 Garmin / Google Fit</div>
                takeout.google.com → Select Fit → Download → Upload CSV
              </div>
            </div>
          </div>

          {/* Upload area */}
          <div
            onClick={() => fileRef.current.click()}
            style={{
              border: `2px dashed ${C.border}`, borderRadius: 14,
              padding: "48px 20px", textAlign: "center",
              cursor: "pointer", marginBottom: 20,
              background: "rgba(59,201,232,0.03)",
              transition: "all 0.2s",
            }}>
            <input ref={fileRef} type="file" accept=".csv"
              onChange={handleCSV} style={{ display: "none" }} />
            <div style={{ fontSize: 40, marginBottom: 12 }}>⌚</div>
            <div style={{ color: C.text, fontWeight: 600, marginBottom: 6 }}>
              Click to upload smartwatch CSV
            </div>
            <div style={{ color: C.muted, fontSize: 13 }}>
              Supports Apple Health, Samsung Health, Fitbit, Garmin, Google Fit exports
            </div>
          </div>

          {loading && (
            <div style={{ color: C.accent, textAlign: "center", padding: 20 }}>
              📊 Parsing your health data...
            </div>
          )}

          {error && (
            <div style={{ color: C.danger, padding: 16, background: "rgba(255,77,109,0.1)", borderRadius: 10, marginBottom: 16 }}>
              ⚠️ {error}
            </div>
          )}

          {/* Results */}
          {result && (
            <div>
              <div style={{ color: C.accent2, marginBottom: 20, fontSize: 14 }}>
                ✅ {result.total_records.toLocaleString()} records loaded from your smartwatch
              </div>

              {/* Summary stats */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 12, marginBottom: 24 }}>
                <StatCard icon="❤️" label="AVG HEART RATE" value={result.summary.avg_heart_rate} unit="bpm"   color={C.danger}  />
                <StatCard icon="🚶" label="AVG STEPS"       value={result.summary.avg_steps}      unit="steps" color={C.accent2} />
                <StatCard icon="🫁" label="AVG SPO2"         value={result.summary.avg_spo2}       unit="%"     color={C.accent}  />
                <StatCard icon="😴" label="AVG SLEEP"        value={result.summary.avg_sleep}      unit="hrs"   color="#9b59b6"   />
                <StatCard icon="🔥" label="AVG CALORIES"     value={result.summary.avg_calories}   unit="kcal"  color={C.warn}    />
              </div>

              {/* Chart tabs */}
              <div style={{
                background: C.card, border: `1px solid ${C.border}`,
                borderRadius: 14, padding: 20,
              }}>
                <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
                  {charts.map(c => (
                    <button key={c.key} onClick={() => setActiveChart(c.key)}
                      style={{
                        padding: "6px 14px", borderRadius: 8, border: "none",
                        background: activeChart === c.key ? c.color + "33" : "rgba(59,201,232,0.06)",
                        color: activeChart === c.key ? c.color : C.muted,
                        fontWeight: 600, fontSize: 13, cursor: "pointer",
                        borderBottom: activeChart === c.key ? `2px solid ${c.color}` : "2px solid transparent",
                      }}>
                      {c.label}
                    </button>
                  ))}
                </div>

                {charts.map(c => activeChart === c.key && (
                  <div key={c.key}>
                    <VitalChart
                      data={result.data[c.key]}
                      xKey="date"
                      yKey={c.yKey}
                      label={c.label}
                      color={c.color}
                      type={c.type}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ══ GOOGLE FIT TAB ══════════════════════════════════════════ */}
      {tab === "googlefit" && (
        <div style={{
          background: C.card, border: `1px solid ${C.border}`,
          borderRadius: 14, padding: 40, textAlign: "center",
        }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🏃</div>
          <h3 style={{ color: C.accent, margin: "0 0 12px" }}>Google Fit Integration</h3>
          <p style={{ color: C.muted, fontSize: 14, marginBottom: 24, lineHeight: 1.6 }}>
            Google Fit integration requires OAuth credentials setup.<br />
            Add <strong style={{ color: C.text }}>GOOGLE_CLIENT_ID</strong> and <strong style={{ color: C.text }}>GOOGLE_CLIENT_SECRET</strong> to your Railway environment variables.
          </p>

          <div style={{
            background: "rgba(59,201,232,0.06)", borderRadius: 10,
            padding: 20, textAlign: "left", marginBottom: 24,
          }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.accent, marginBottom: 12 }}>
              Setup Steps:
            </div>
            {[
              "1. Go to console.cloud.google.com",
              "2. Create a project → Enable Fitness API",
              "3. Create OAuth 2.0 credentials",
              "4. Add GOOGLE_CLIENT_ID to Railway variables",
              "5. Add GOOGLE_CLIENT_SECRET to Railway variables",
              "6. Redeploy backend on Railway",
            ].map((s, i) => (
              <div key={i} style={{ color: C.muted, fontSize: 13, marginBottom: 6 }}>{s}</div>
            ))}
          </div>

          <div style={{ color: C.muted, fontSize: 13 }}>
            For now, use the <strong style={{ color: C.accent }}>Upload CSV</strong> tab which works with all smartwatches including Google Fit exports.
          </div>
        </div>
      )}
    </div>
  );
}
