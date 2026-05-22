import { useState, useRef, useEffect } from "react";
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

// ── Stat Card ─────────────────────────────────────────────────────
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

// ── Chart ─────────────────────────────────────────────────────────
function VitalChart({ data, xKey, yKey, label, color, type = "line" }) {
  if (!data || data.length === 0) return (
    <div style={{ color: C.muted, textAlign: "center", padding: 40, fontSize: 13 }}>
      No {label} data available
    </div>
  );
  return (
    <ResponsiveContainer width="100%" height={200}>
      {type === "bar" ? (
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
          <XAxis dataKey={xKey} stroke={C.muted} tick={{ fontSize: 10 }} tickFormatter={v => v?.slice(5)} />
          <YAxis stroke={C.muted} tick={{ fontSize: 10 }} />
          <Tooltip contentStyle={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 12 }} />
          <Bar dataKey={yKey} fill={color} radius={[4,4,0,0]} name={label} />
        </BarChart>
      ) : (
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
          <XAxis dataKey={xKey} stroke={C.muted} tick={{ fontSize: 10 }} tickFormatter={v => v?.slice(5)} />
          <YAxis stroke={C.muted} tick={{ fontSize: 10 }} />
          <Tooltip contentStyle={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 12 }} />
          <Line type="monotone" dataKey={yKey} stroke={color} dot={false} strokeWidth={2} name={label} />
        </LineChart>
      )}
    </ResponsiveContainer>
  );
}

// ── Results Panel (shared between CSV and Google Fit) ─────────────
function ResultsPanel({ result }) {
  const [activeChart, setActiveChart] = useState("heart_rate");

  const charts = [
    { key: "heart_rate", label: "❤️ Heart Rate", yKey: "heart_rate",  unit: "bpm",   color: C.danger,  type: "line" },
    { key: "steps",      label: "🚶 Steps",       yKey: "steps",       unit: "steps", color: C.accent2, type: "bar"  },
    { key: "spo2",       label: "🫁 SpO2",         yKey: "spo2",        unit: "%",     color: C.accent,  type: "line" },
    { key: "sleep",      label: "😴 Sleep",        yKey: "sleep_hours", unit: "hrs",   color: "#9b59b6", type: "bar"  },
    { key: "calories",   label: "🔥 Calories",     yKey: "calories",    unit: "kcal",  color: C.warn,    type: "bar"  },
  ];

  return (
    <div>
      <div style={{ color: C.accent2, marginBottom: 20, fontSize: 14 }}>
        ✅ {result.total_records?.toLocaleString()} records loaded
        {result.source === "google_fit" && (
          <span style={{ color: C.accent, marginLeft: 10, fontSize: 12 }}>
            📡 Live from Google Fit
          </span>
        )}
      </div>

      {/* Summary */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))", gap: 12, marginBottom: 24 }}>
        <StatCard icon="❤️" label="AVG HEART RATE" value={result.summary?.avg_heart_rate} unit="bpm"   color={C.danger}  />
        <StatCard icon="🚶" label="AVG STEPS"       value={result.summary?.avg_steps}      unit="/day"  color={C.accent2} />
        <StatCard icon="🫁" label="AVG SPO2"         value={result.summary?.avg_spo2}       unit="%"     color={C.accent}  />
        <StatCard icon="😴" label="AVG SLEEP"        value={result.summary?.avg_sleep}      unit="hrs"   color="#9b59b6"   />
        <StatCard icon="🔥" label="AVG CALORIES"     value={result.summary?.avg_calories}   unit="kcal"  color={C.warn}    />
      </div>

      {/* Charts */}
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 20 }}>
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
          <VitalChart key={c.key} data={result.data?.[c.key]} xKey="date"
            yKey={c.yKey} label={c.label} color={c.color} type={c.type} />
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
//  MAIN PAGE
// ═══════════════════════════════════════════════════════════════════
export default function SmartWatchPage() {
  const [tab, setTab]           = useState("csv");
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");
  const [result, setResult]     = useState(null);
  const [fitStatus, setFitStatus] = useState(null);
  const [fitToken, setFitToken] = useState(() => {
    try { return JSON.parse(localStorage.getItem("google_fit_token")); }
    catch { return null; }
  });
  const [days, setDays]         = useState(30);
  const fileRef = useRef();

  // Check if Google Fit is configured on backend
  useEffect(() => {
    smartwatchAPI.googleFitStatus()
      .then(r => setFitStatus(r.data))
      .catch(() => setFitStatus({ configured: false }));
  }, []);

  // Handle Google OAuth callback (code in URL)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code   = params.get("code");
    if (code && !fitToken) {
      setTab("googlefit");
      setLoading(true);
      smartwatchAPI.googleFitExchange(code)
        .then(r => {
          const token = r.data;
          localStorage.setItem("google_fit_token", JSON.stringify(token));
          setFitToken(token);
          // Clean URL
          window.history.replaceState({}, "", window.location.pathname);
          // Auto-fetch data
          return smartwatchAPI.googleFitData(token, days);
        })
        .then(r => { setResult(r.data); setLoading(false); })
        .catch(e => { setError(e.response?.data?.detail || "Google Fit error"); setLoading(false); });
    }
  }, []);

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

  // ── Google Fit Connect ────────────────────────────────────────
  async function connectGoogleFit() {
    setLoading(true); setError("");
    try {
      const res = await smartwatchAPI.googleFitAuthUrl();
      window.location.href = res.data.auth_url;
    } catch (e) {
      setError(e.response?.data?.detail || "Could not get Google Fit auth URL");
      setLoading(false);
    }
  }

  // ── Google Fit Fetch Data ─────────────────────────────────────
  async function fetchGoogleFitData() {
    if (!fitToken) return;
    setLoading(true); setError(""); setResult(null);
    try {
      const res = await smartwatchAPI.googleFitData(fitToken, days);
      setResult(res.data);
      // Update token if refreshed
      if (res.data.token) {
        localStorage.setItem("google_fit_token", JSON.stringify(res.data.token));
        setFitToken(res.data.token);
      }
    } catch (e) {
      setError(e.response?.data?.detail || "Failed to fetch Google Fit data");
    }
    setLoading(false);
  }

  // ── Disconnect Google Fit ─────────────────────────────────────
  function disconnectGoogleFit() {
    localStorage.removeItem("google_fit_token");
    setFitToken(null);
    setResult(null);
  }

  return (
    <div style={{ fontFamily: "'Segoe UI', sans-serif", color: C.text }}>
      <h2 style={{ margin: "0 0 6px", fontSize: 22 }}>⌚ Smartwatch Data</h2>
      <p style={{ color: C.muted, fontSize: 14, marginBottom: 24 }}>
        Upload CSV from your smartwatch or connect Google Fit for real-time automatic sync.
      </p>

      {/* ── Tab selector ──────────────────────────────────────── */}
      <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
        {[
          { id: "csv",       label: "📂 Upload CSV" },
          { id: "googlefit", label: "🏃 Google Fit" + (fitToken ? " ✅" : "") },
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

      {/* ══ CSV TAB ══════════════════════════════════════════════ */}
      {tab === "csv" && (
        <div>
          <div style={{
            background: "rgba(59,201,232,0.04)", border: `1px solid ${C.border}`,
            borderRadius: 14, padding: 20, marginBottom: 20,
          }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.accent, marginBottom: 12 }}>
              📖 How to export data from your smartwatch
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 16, fontSize: 13, color: C.muted, lineHeight: 1.8 }}>
              <div>
                <div style={{ color: C.text, fontWeight: 600, marginBottom: 4 }}>🍎 Apple Watch</div>
                Health app → Tap profile → Export All Health Data → Upload CSV
              </div>
              <div>
                <div style={{ color: C.text, fontWeight: 600, marginBottom: 4 }}>📱 Samsung Galaxy Watch</div>
                Samsung Health → Settings → Download personal data → Upload CSV
              </div>
              <div>
                <div style={{ color: C.text, fontWeight: 600, marginBottom: 4 }}>🏃 Fitbit</div>
                fitbit.com → Settings → Export Account Archive → Upload CSV
              </div>
              <div>
                <div style={{ color: C.text, fontWeight: 600, marginBottom: 4 }}>🤖 Google Fit</div>
                takeout.google.com → Select Fit → Download → Upload CSV
              </div>
            </div>
          </div>

          <div onClick={() => fileRef.current.click()}
            style={{
              border: `2px dashed ${C.border}`, borderRadius: 14,
              padding: "48px 20px", textAlign: "center",
              cursor: "pointer", marginBottom: 20,
              background: "rgba(59,201,232,0.03)",
            }}>
            <input ref={fileRef} type="file" accept=".csv"
              onChange={handleCSV} style={{ display: "none" }} />
            <div style={{ fontSize: 48, marginBottom: 12 }}>⌚</div>
            <div style={{ color: C.text, fontWeight: 600, fontSize: 16, marginBottom: 6 }}>
              Click to upload smartwatch CSV
            </div>
            <div style={{ color: C.muted, fontSize: 13 }}>
              Supports Apple Watch, Samsung, Fitbit, Garmin, Google Fit exports
            </div>
          </div>

          {loading && <div style={{ color: C.accent, textAlign: "center", padding: 20 }}>📊 Parsing your health data...</div>}
          {error   && <div style={{ color: C.danger, padding: 16, background: "rgba(255,77,109,0.1)", borderRadius: 10, marginBottom: 16 }}>⚠️ {error}</div>}
          {result  && <ResultsPanel result={result} />}
        </div>
      )}

      {/* ══ GOOGLE FIT TAB ══════════════════════════════════════ */}
      {tab === "googlefit" && (
        <div>
          {/* ── Not configured ─────────────────────────────────── */}
          {fitStatus && !fitStatus.configured && (
            <div style={{
              background: C.card, border: `1px solid ${C.warn}44`,
              borderRadius: 14, padding: 32, textAlign: "center",
            }}>
              <div style={{ fontSize: 40, marginBottom: 16 }}>⚙️</div>
              <h3 style={{ color: C.warn, margin: "0 0 12px" }}>Google Fit Setup Required</h3>
              <p style={{ color: C.muted, fontSize: 14, marginBottom: 24, lineHeight: 1.7 }}>
                To enable Google Fit real-time sync, add these to your Railway environment variables:
              </p>
              <div style={{ background: "rgba(0,0,0,0.3)", borderRadius: 10, padding: 16, textAlign: "left", marginBottom: 24, fontFamily: "monospace", fontSize: 13 }}>
                <div style={{ color: C.accent2, marginBottom: 8 }}>GOOGLE_CLIENT_ID = your-client-id</div>
                <div style={{ color: C.accent2, marginBottom: 8 }}>GOOGLE_CLIENT_SECRET = your-client-secret</div>
                <div style={{ color: C.accent2 }}>GOOGLE_REDIRECT_URI = https://healnet-web.vercel.app/google-callback</div>
              </div>
              <div style={{ background: "rgba(59,201,232,0.06)", borderRadius: 10, padding: 16, textAlign: "left" }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: C.accent, marginBottom: 10 }}>Setup Steps:</div>
                {[
                  "1. Go to console.cloud.google.com",
                  "2. Create project → Enable Fitness API",
                  "3. OAuth consent screen → External",
                  "4. Create OAuth 2.0 Client ID (Web application)",
                  "5. Add Authorized redirect URI: https://healnet-web.vercel.app/google-callback",
                  "6. Copy Client ID and Secret → add to Railway variables",
                  "7. Redeploy Railway backend",
                ].map((s, i) => (
                  <div key={i} style={{ color: C.muted, fontSize: 13, marginBottom: 5 }}>{s}</div>
                ))}
              </div>
            </div>
          )}

          {/* ── Configured but not connected ───────────────────── */}
          {fitStatus?.configured && !fitToken && (
            <div style={{
              background: C.card, border: `1px solid ${C.border}`,
              borderRadius: 14, padding: 40, textAlign: "center",
            }}>
              <div style={{ fontSize: 56, marginBottom: 16 }}>🏃</div>
              <h3 style={{ color: C.accent, margin: "0 0 12px", fontSize: 20 }}>Connect Google Fit</h3>
              <p style={{ color: C.muted, fontSize: 14, marginBottom: 32, lineHeight: 1.6 }}>
                Sign in with your Google account to automatically sync your<br />
                heart rate, steps, sleep, and calories data in real-time.
              </p>
              <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap", marginBottom: 24 }}>
                {["❤️ Heart Rate", "🚶 Steps", "😴 Sleep", "🔥 Calories"].map(label => (
                  <span key={label} style={{
                    background: "rgba(59,201,232,0.1)", color: C.accent,
                    padding: "6px 16px", borderRadius: 20, fontSize: 13,
                  }}>{label}</span>
                ))}
              </div>
              <button onClick={connectGoogleFit} disabled={loading}
                style={{
                  padding: "14px 40px", borderRadius: 12, border: "none",
                  background: loading ? "rgba(59,201,232,0.3)" : C.accent,
                  color: C.bg, fontWeight: 700, fontSize: 16,
                  cursor: loading ? "not-allowed" : "pointer",
                }}>
                {loading ? "Connecting..." : "🔗 Connect Google Fit"}
              </button>
              {error && <div style={{ color: C.danger, marginTop: 16, fontSize: 13 }}>⚠️ {error}</div>}
            </div>
          )}

          {/* ── Connected ──────────────────────────────────────── */}
          {fitStatus?.configured && fitToken && (
            <div>
              <div style={{
                background: "rgba(0,245,160,0.08)", border: `1px solid ${C.accent2}44`,
                borderRadius: 12, padding: "12px 20px",
                display: "flex", justifyContent: "space-between",
                alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 12,
              }}>
                <div style={{ color: C.accent2, fontWeight: 600 }}>
                  ✅ Google Fit Connected
                </div>
                <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                  <select value={days} onChange={e => setDays(Number(e.target.value))}
                    style={{
                      padding: "6px 12px", borderRadius: 8,
                      background: "rgba(59,201,232,0.07)", border: `1px solid ${C.border}`,
                      color: C.text, fontSize: 13, outline: "none",
                    }}>
                    <option value={7}>Last 7 days</option>
                    <option value={14}>Last 14 days</option>
                    <option value={30}>Last 30 days</option>
                    <option value={60}>Last 60 days</option>
                    <option value={90}>Last 90 days</option>
                  </select>
                  <button onClick={fetchGoogleFitData} disabled={loading}
                    style={{
                      padding: "7px 18px", borderRadius: 8, border: "none",
                      background: C.accent, color: C.bg,
                      fontWeight: 700, fontSize: 13, cursor: "pointer",
                    }}>
                    {loading ? "Fetching..." : "🔄 Refresh Data"}
                  </button>
                  <button onClick={disconnectGoogleFit}
                    style={{
                      padding: "7px 18px", borderRadius: 8,
                      border: `1px solid ${C.danger}44`, background: "none",
                      color: C.danger, fontSize: 13, cursor: "pointer",
                    }}>
                    Disconnect
                  </button>
                </div>
              </div>

              {loading && <div style={{ color: C.accent, textAlign: "center", padding: 20 }}>📡 Fetching from Google Fit...</div>}
              {error   && <div style={{ color: C.danger, padding: 16, background: "rgba(255,77,109,0.1)", borderRadius: 10, marginBottom: 16 }}>⚠️ {error}</div>}

              {!result && !loading && (
                <div style={{ textAlign: "center", padding: 40 }}>
                  <button onClick={fetchGoogleFitData}
                    style={{
                      padding: "14px 40px", borderRadius: 12, border: "none",
                      background: C.accent, color: C.bg,
                      fontWeight: 700, fontSize: 16, cursor: "pointer",
                    }}>
                    📡 Load Google Fit Data
                  </button>
                </div>
              )}

              {result && <ResultsPanel result={result} />}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
