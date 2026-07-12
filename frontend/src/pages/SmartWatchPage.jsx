import { useState, useRef, useEffect } from "react";
import { smartwatchAPI, appleHealthAPI } from "../services/api";
import {
  LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from "recharts";
import { useNetwork } from "../offline/useNetwork";
import {
  cacheWearableResult, getCachedWearableResult,
  cacheGeneric, getCachedGeneric,
} from "../offline/offlineStore";
import { OfflineDataBadge } from "../offline/OfflineBanner";

const C = {
  bg: "#030c2c", card: "#04163c", border: "rgba(59,201,232,0.18)",
  accent: "#3BC9E8", accent2: "#00f5a0", danger: "#ff4d6d",
  warn: "#ffd166", text: "#e8f4f8", muted: "rgba(232,244,248,0.5)",
  apple: "#fc3d39",
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
          <Bar dataKey={yKey} fill={color} radius={[4, 4, 0, 0]} name={label} />
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

// ── Results Panel (CSV + Google Fit) ──────────────────────────────
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
          <span style={{ color: C.accent, marginLeft: 10, fontSize: 12 }}>📡 Live from Google Fit</span>
        )}
        {result._fromCache && (
          <span style={{ color: C.warn, marginLeft: 10, fontSize: 12 }}>📦 Cached (last synced)</span>
        )}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))", gap: 12, marginBottom: 24 }}>
        <StatCard icon="❤️" label="AVG HEART RATE" value={result.summary?.avg_heart_rate} unit="bpm"  color={C.danger}  />
        <StatCard icon="🚶" label="AVG STEPS"       value={result.summary?.avg_steps}      unit="/day" color={C.accent2} />
        <StatCard icon="🫁" label="AVG SPO2"         value={result.summary?.avg_spo2}       unit="%"    color={C.accent}  />
        <StatCard icon="😴" label="AVG SLEEP"        value={result.summary?.avg_sleep}      unit="hrs"  color="#9b59b6"   />
        <StatCard icon="🔥" label="AVG CALORIES"     value={result.summary?.avg_calories}   unit="kcal" color={C.warn}    />
      </div>
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 20 }}>
        <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
          {charts.map(c => (
            <button key={c.key} onClick={() => setActiveChart(c.key)} style={{
              padding: "6px 14px", borderRadius: 8, border: "none",
              background: activeChart === c.key ? c.color + "33" : "rgba(59,201,232,0.06)",
              color: activeChart === c.key ? c.color : C.muted,
              fontWeight: 600, fontSize: 13, cursor: "pointer",
              borderBottom: activeChart === c.key ? `2px solid ${c.color}` : "2px solid transparent",
            }}>{c.label}</button>
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

// ── Apple Health Tab ──────────────────────────────────────────────
function AppleHealthTab() {
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState("");
  const [ahData, setAhData]           = useState(null);
  const [days, setDays]               = useState(30);
  const [activeChart, setActiveChart] = useState("steps");
  const [fromCache, setFromCache]     = useState(false);

  const { isOnline } = useNetwork();
  const offline = !isOnline;

  const user   = (() => { try { return JSON.parse(localStorage.getItem("healnet_user")); } catch { return null; } })();
  const userId = user?.id || user?.email || "";
  const webhookUrl = `https://healnet-web-production.up.railway.app/api/apple-health/webhook?user_id=${userId}`;

  async function loadData() {
    if (!userId) return;

    // Offline → load cache directly
    if (offline || !navigator.onLine) {
      const cached = getCachedGeneric(`apple_health_${userId}_${days}`);
      if (cached) { setAhData(cached); setFromCache(true); }
      else setError("You're offline and no cached Apple Health data is available.");
      return;
    }

    setLoading(true); setError(""); setFromCache(false);
    try {
      const res = await appleHealthAPI.getData(userId, days);
      setAhData(res.data);
      cacheGeneric(`apple_health_${userId}_${days}`, res.data);
    } catch (e) {
      const cached = getCachedGeneric(`apple_health_${userId}_${days}`);
      if (cached) { setAhData(cached); setFromCache(true); }
      else setError(e.response?.data?.detail || "Failed to load Apple Health data");
    }
    setLoading(false);
  }

  useEffect(() => { loadData(); }, [days]);

  const charts = [
    { key: "steps",       label: "🚶 Steps",      yKey: "steps",       color: C.accent2, type: "bar"  },
    { key: "heart_rate",  label: "❤️ Heart Rate", yKey: "heart_rate",  color: C.danger,  type: "line" },
    { key: "sleep_hours", label: "😴 Sleep",       yKey: "sleep_hours", color: "#9b59b6", type: "line" },
  ];

  if (!ahData?.has_data) return (
    <div>
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 32, textAlign: "center", marginBottom: 24 }}>
        <div style={{ fontSize: 52, marginBottom: 12 }}>🍎</div>
        <h3 style={{ color: C.accent, margin: "0 0 10px", fontSize: 20 }}>Connect Apple Health</h3>
        <p style={{ color: C.muted, fontSize: 14, lineHeight: 1.7, margin: 0 }}>
          Sync Steps, Heart Rate and Sleep from your iPhone automatically —<br />
          no cables, no manual exports, always up to date.
        </p>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 16, marginBottom: 24 }}>
        {[
          { n: "1", icon: "📲", title: "Install Health Auto Export", body: 'Download the free "Health Auto Export" app from the App Store on your iPhone.' },
          { n: "2", icon: "🔗", title: "Add Webhook URL", body: "In the app go to Automation → Webhooks → New Webhook and paste your personal URL below." },
          { n: "3", icon: "✅", title: "Enable & Sync", body: "Turn on Step Count, Heart Rate and Sleep Analysis. Tap Sync Now — data appears here instantly." },
        ].map(s => (
          <div key={s.n} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 20 }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>{s.icon}</div>
            <div style={{ fontWeight: 700, color: C.text, marginBottom: 8, fontSize: 14 }}>{s.title}</div>
            <div style={{ color: C.muted, fontSize: 13, lineHeight: 1.7 }}>{s.body}</div>
          </div>
        ))}
      </div>
      <div style={{ background: "rgba(59,201,232,0.05)", border: `1px solid ${C.border}`, borderRadius: 14, padding: 20, marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: C.accent, marginBottom: 10 }}>🔗 Your personal webhook URL</div>
        <div style={{ background: "rgba(0,0,0,0.3)", borderRadius: 8, padding: "10px 14px", fontFamily: "monospace", fontSize: 12, color: C.accent2, wordBreak: "break-all", marginBottom: 12 }}>
          {webhookUrl}
        </div>
        <button onClick={() => navigator.clipboard.writeText(webhookUrl)} style={{ padding: "8px 20px", borderRadius: 8, border: "none", background: C.accent, color: C.bg, fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
          📋 Copy URL
        </button>
      </div>
      {loading && <div style={{ color: C.accent, textAlign: "center", padding: 16 }}>Checking for data...</div>}
      {error   && <div style={{ color: C.danger, padding: 14, background: "rgba(255,77,109,0.1)", borderRadius: 10 }}>⚠️ {error}</div>}
      <button onClick={loadData} disabled={offline} style={{ marginTop: 12, padding: "10px 28px", borderRadius: 10, border: `1px solid ${C.border}`, background: "none", color: offline ? `${C.muted}80` : C.muted, fontSize: 13, cursor: offline ? "not-allowed" : "pointer" }}>
        🔄 Check again after syncing
      </button>
    </div>
  );

  return (
    <div>
      <div style={{ background: "rgba(252,61,57,0.08)", border: "1px solid rgba(252,61,57,0.3)", borderRadius: 12, padding: "12px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div style={{ color: C.apple, fontWeight: 600 }}>
          🍎 Apple Health Connected
          {fromCache && <OfflineDataBadge savedAt={ahData?.savedAt} isOnline={isOnline} />}
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <select value={days} onChange={e => setDays(Number(e.target.value))} style={{ padding: "6px 12px", borderRadius: 8, background: "rgba(59,201,232,0.07)", border: `1px solid ${C.border}`, color: C.text, fontSize: 13, outline: "none" }}>
            {[7, 14, 30, 60, 90].map(d => <option key={d} value={d}>Last {d} days</option>)}
          </select>
          <button onClick={loadData} disabled={loading || offline} style={{ padding: "7px 18px", borderRadius: 8, border: "none", background: offline ? `${C.apple}66` : C.apple, color: "#fff", fontWeight: 700, fontSize: 13, cursor: offline ? "not-allowed" : "pointer" }}>
            {loading ? "Loading..." : "🔄 Refresh"}
          </button>
        </div>
      </div>
      {error && <div style={{ color: C.danger, padding: 14, background: "rgba(255,77,109,0.1)", borderRadius: 10, marginBottom: 16 }}>⚠️ {error}</div>}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 12, marginBottom: 24 }}>
        <StatCard icon="🚶" label="AVG STEPS"      value={ahData.summary?.avg_steps}      unit="/day" color={C.accent2} />
        <StatCard icon="❤️" label="AVG HEART RATE" value={ahData.summary?.avg_heart_rate} unit="bpm"  color={C.danger}  />
        <StatCard icon="😴" label="AVG SLEEP"       value={ahData.summary?.avg_sleep}      unit="hrs"  color="#9b59b6"   />
      </div>
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 20 }}>
        <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
          {charts.map(c => (
            <button key={c.key} onClick={() => setActiveChart(c.key)} style={{
              padding: "6px 14px", borderRadius: 8, border: "none",
              background: activeChart === c.key ? c.color + "33" : "rgba(59,201,232,0.06)",
              color: activeChart === c.key ? c.color : C.muted,
              fontWeight: 600, fontSize: 13, cursor: "pointer",
              borderBottom: activeChart === c.key ? `2px solid ${c.color}` : "2px solid transparent",
            }}>{c.label}</button>
          ))}
        </div>
        {charts.map(c => activeChart === c.key && (
          <VitalChart key={c.key} data={ahData.data?.[c.key]} xKey="date"
            yKey={c.yKey} label={c.label} color={c.color} type={c.type} />
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
//  ALERTS PANEL  (already pure client-side — works offline natively)
// ═══════════════════════════════════════════════════════════════════

function evaluateAlerts(summary) {
  const alerts = [];
  function add(vital, value, level, message) {
    alerts.push({ vital, value, level, message, id: `${vital}-${Date.now()}-${Math.random()}` });
  }
  const hr  = summary?.avg_heart_rate;
  const spo = summary?.avg_spo2;
  const sys = summary?.avg_systolic_bp;

  if (hr !== null && hr !== undefined) {
    if (hr > 120 || hr < 40)
      add("heart_rate", hr, "danger", `Average heart rate ${hr} bpm is critically abnormal.`);
    else if (hr > 100 || hr < 55)
      add("heart_rate", hr, "warning", `Average heart rate ${hr} bpm needs attention.`);
  }
  if (spo !== null && spo !== undefined) {
    if (spo < 90)
      add("spo2", spo, "danger", `Average SpO2 ${spo}% is dangerously low.`);
    else if (spo < 95)
      add("spo2", spo, "warning", `Average SpO2 ${spo}% is below normal.`);
  }
  if (sys !== null && sys !== undefined) {
    if (sys > 180 || sys < 80)
      add("systolic_bp", sys, "danger", `Average BP ${sys} mmHg is critically abnormal.`);
    else if (sys > 140 || sys < 90)
      add("systolic_bp", sys, "warning", `Average BP ${sys} mmHg needs attention.`);
  }
  return alerts;
}

const ALERT_META = {
  heart_rate:   { icon: "❤️",  label: "Heart Rate" },
  spo2:         { icon: "🫁",  label: "SpO2"       },
  systolic_bp:  { icon: "💉",  label: "Blood Pressure" },
};

function AlertsPanel({ summary, offline }) {
  const alerts = evaluateAlerts(summary);

  if (!summary) return (
    <div style={{ background: "rgba(59,201,232,0.04)", border: `1px dashed ${C.border}`, borderRadius: 12, padding: 32, textAlign: "center", color: C.muted, fontSize: 14 }}>
      {offline
        ? "No cached data found. Connect once while online to enable offline alerts."
        : "Load data from CSV, Google Fit, or Apple Health to see alerts."}
    </div>
  );

  if (alerts.length === 0) return (
    <div style={{ background: "rgba(0,245,160,0.06)", border: `1px solid ${C.accent2}33`, borderRadius: 12, padding: 28, textAlign: "center" }}>
      <div style={{ fontSize: 36, marginBottom: 10 }}>✅</div>
      <div style={{ color: C.accent2, fontWeight: 700, fontSize: 16, marginBottom: 6 }}>All vitals look normal</div>
      <div style={{ color: C.muted, fontSize: 13 }}>No abnormal readings detected in this dataset.</div>
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {alerts.map(a => {
        const meta    = ALERT_META[a.vital] || { icon: "⚠️", label: a.vital };
        const isDanger = a.level === "danger";
        const color   = isDanger ? C.danger : C.warn;
        return (
          <div key={a.id} style={{
            background: `${color}0d`,
            border: `1px solid ${color}55`,
            borderLeft: `4px solid ${color}`,
            borderRadius: 12, padding: "14px 18px",
            display: "flex", alignItems: "flex-start", gap: 14,
          }}>
            <div style={{ fontSize: 26, lineHeight: 1, marginTop: 2 }}>{meta.icon}</div>
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
                <span style={{ fontWeight: 700, color, fontSize: 14 }}>
                  {isDanger ? "🚨 Critical" : "⚠️ Warning"} — {meta.label}
                </span>
                <span style={{ background: `${color}22`, color, border: `1px solid ${color}44`, borderRadius: 6, padding: "2px 8px", fontSize: 11, fontWeight: 700 }}>
                  {a.value} {a.vital === "heart_rate" ? "bpm" : a.vital === "spo2" ? "%" : "mmHg"}
                </span>
              </div>
              <div style={{ color: C.muted, fontSize: 13, lineHeight: 1.5 }}>{a.message}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
//  PDF REPORT GENERATOR  (fully client-side — already works offline)
// ═══════════════════════════════════════════════════════════════════

function generateReportHTML(result, reportType, dateRange, darkMode = false) {
  const s   = result?.summary || {};
  const src = result?.source  || "Unknown";
  const now = new Date().toLocaleString();
  const alerts = evaluateAlerts(s);

  const T = darkMode ? {
    pageBg:       "#030c2c",
    cardBg:       "#04163c",
    headerBorder: "#3BC9E8",
    headingColor: "#3BC9E8",
    textColor:    "#e8f4f8",
    mutedColor:   "#7fb8cc",
    thBg:         "#04163c",
    thColor:      "#3BC9E8",
    tdBorder:     "#0d2a4a",
    tdAltBg:      "#061e3a",
    metricBoxBg:  "#061e3a",
    metricBoxBdr: "#0d3a5c",
    metricValClr: "#e8f4f8",
    disclaimerBg: "#1a1500",
    disclaimerBdr:"#5a4800",
    disclaimerClr:"#ffd166",
    footerColor:  "#4a8aa0",
    footerBorder: "#0d2a4a",
    logoColor:    "#e8f4f8",
    logoAccent:   "#3BC9E8",
  } : {
    pageBg:       "#ffffff",
    cardBg:       "#f8fdff",
    headerBorder: "#3BC9E8",
    headingColor: "#030c2c",
    textColor:    "#1a1a2e",
    mutedColor:   "#666666",
    thBg:         "#030c2c",
    thColor:      "#3BC9E8",
    tdBorder:     "#f0f0f0",
    tdAltBg:      "#f8fdff",
    metricBoxBg:  "#f0fafd",
    metricBoxBdr: "#cbeef7",
    metricValClr: "#030c2c",
    disclaimerBg: "#fffbe6",
    disclaimerBdr:"#ffe58f",
    disclaimerClr:"#8a6d00",
    footerColor:  "#aaaaaa",
    footerBorder: "#e0e0e0",
    logoColor:    "#030c2c",
    logoAccent:   "#3BC9E8",
  };

  const alertRows = alerts.length > 0
    ? alerts.map(a => `
        <tr>
          <td>${ALERT_META[a.vital]?.icon || "⚠️"} ${ALERT_META[a.vital]?.label || a.vital}</td>
          <td style="color:${a.level === "danger" ? "#e74c3c" : "#f39c12"}; font-weight:600;">${a.level === "danger" ? "Critical" : "Warning"}</td>
          <td>${a.value} ${a.vital === "heart_rate" ? "bpm" : a.vital === "spo2" ? "%" : "mmHg"}</td>
          <td>${a.message}</td>
        </tr>`).join("")
    : `<tr><td colspan="4" style="text-align:center; color:#27ae60; font-style:italic;">✅ No abnormal readings detected</td></tr>`;

  const metricRows = [
    ["❤️ Average Heart Rate", s.avg_heart_rate, "bpm"],
    ["🚶 Average Steps",       s.avg_steps,       "steps/day"],
    ["🫁 Average SpO2",         s.avg_spo2,        "%"],
    ["😴 Average Sleep",        s.avg_sleep,       "hours"],
    ["🔥 Average Calories",     s.avg_calories,    "kcal"],
  ].filter(([, v]) => v !== null && v !== undefined);

  const logoSVG = `
    <svg width="72" height="72" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" style="flex-shrink:0;">
      <defs>
        <linearGradient id="gL" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#5DCB5F"/>
          <stop offset="100%" stop-color="#1E8C3A"/>
        </linearGradient>
        <linearGradient id="gR" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#29ABE2"/>
          <stop offset="100%" stop-color="#1A5FA8"/>
        </linearGradient>
        <radialGradient id="gH" cx="50%" cy="40%" r="60%">
          <stop offset="0%" stop-color="#6DD96F"/>
          <stop offset="100%" stop-color="#1E8C3A"/>
        </radialGradient>
        <linearGradient id="gStem" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stop-color="#5DCB5F"/>
          <stop offset="100%" stop-color="#29ABE2"/>
        </linearGradient>
      </defs>
      <path d="M100 18
               C82 18 63 25 52 38
               C40 52 38 68 41 82
               C44 95 52 105 62 112
               C70 118 80 120 90 121
               C95 122 100 122 100 122
               L100 18 Z"
            fill="url(#gL)"/>
      <path d="M100 18
               C118 18 137 25 148 38
               C160 52 162 68 159 82
               C156 95 148 105 138 112
               C130 118 120 120 110 121
               C105 122 100 122 100 122
               L100 18 Z"
            fill="url(#gR)"/>
      <path d="M88 122 C87 134 89 143 93 150 C96 155 100 158 100 158
               C100 158 104 155 107 150 C111 143 113 134 112 122"
            fill="url(#gStem)"/>
      <line x1="100" y1="55"  x2="60"  y2="38"  stroke="white" stroke-width="2.5" opacity="0.55"/>
      <line x1="100" y1="70"  x2="44"  y2="60"  stroke="white" stroke-width="2.5" opacity="0.55"/>
      <line x1="100" y1="88"  x2="44"  y2="84"  stroke="white" stroke-width="2.5" opacity="0.55"/>
      <line x1="100" y1="104" x2="56"  y2="106" stroke="white" stroke-width="2.5" opacity="0.55"/>
      <line x1="60"  y1="38"  x2="44"  y2="60"  stroke="white" stroke-width="1.8" opacity="0.4"/>
      <line x1="44"  y1="60"  x2="44"  y2="84"  stroke="white" stroke-width="1.8" opacity="0.4"/>
      <line x1="44"  y1="84"  x2="56"  y2="106" stroke="white" stroke-width="1.8" opacity="0.4"/>
      <line x1="100" y1="55"  x2="140" y2="38"  stroke="white" stroke-width="2.5" opacity="0.55"/>
      <line x1="100" y1="70"  x2="156" y2="60"  stroke="white" stroke-width="2.5" opacity="0.55"/>
      <line x1="100" y1="88"  x2="156" y2="84"  stroke="white" stroke-width="2.5" opacity="0.55"/>
      <line x1="100" y1="104" x2="144" y2="106" stroke="white" stroke-width="2.5" opacity="0.55"/>
      <line x1="140" y1="38"  x2="156" y2="60"  stroke="white" stroke-width="1.8" opacity="0.4"/>
      <line x1="156" y1="60"  x2="156" y2="84"  stroke="white" stroke-width="1.8" opacity="0.4"/>
      <line x1="156" y1="84"  x2="144" y2="106" stroke="white" stroke-width="1.8" opacity="0.4"/>
      <circle cx="60"  cy="38"  r="6" fill="white" opacity="0.9"/>
      <circle cx="44"  cy="60"  r="6" fill="white" opacity="0.9"/>
      <circle cx="44"  cy="84"  r="6" fill="white" opacity="0.9"/>
      <circle cx="56"  cy="106" r="6" fill="white" opacity="0.9"/>
      <circle cx="140" cy="38"  r="6" fill="white" opacity="0.9"/>
      <circle cx="156" cy="60"  r="6" fill="white" opacity="0.9"/>
      <circle cx="156" cy="84"  r="6" fill="white" opacity="0.9"/>
      <circle cx="144" cy="106" r="6" fill="white" opacity="0.9"/>
      <circle cx="100" cy="75" r="34" fill="white" opacity="0.2"/>
      <circle cx="100" cy="75" r="32" fill="none" stroke="white" stroke-width="5"/>
      <circle cx="100" cy="75" r="27" fill="url(#gH)"/>
      <path d="M100 93
               C100 93 74 77 74 62
               C74 53 80 46 89 46
               C93.5 46 97.5 48.5 100 52
               C102.5 48.5 106.5 46 111 46
               C120 46 126 53 126 62
               C126 77 100 93 100 93 Z"
            fill="white"/>
    </svg>`;

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>HealNet Health Report</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body {
      font-family: 'Segoe UI', Arial, sans-serif;
      color: ${T.textColor};
      background: ${T.pageBg} !important;
      padding: 32px 40px 90px 40px;
    }
    .header {
      border-bottom: 3px solid ${T.headerBorder};
      padding-bottom: 16px;
      margin-bottom: 22px;
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
    }
    .logo-wrap { display: flex; align-items: center; gap: 12px; }
    .logo-text { font-size: 28px; font-weight: 800; letter-spacing: -0.5px; line-height: 1; }
    .logo-text .heal { color: #4CAF50; }
    .logo-text .net  { color: #1565C0; }
    .logo-tagline { font-size: 10px; color: ${T.mutedColor}; margin-top: 4px; letter-spacing: 0.4px; }
    .report-label { font-size: 12px; color: ${T.mutedColor}; margin-top: 6px; }
    .meta { text-align: right; font-size: 11px; color: ${T.mutedColor}; line-height: 1.75; }
    .meta strong { color: ${T.textColor}; }
    h2 {
      font-size: 11px; font-weight: 700; color: ${T.headingColor};
      margin: 18px 0 8px; padding-bottom: 5px;
      border-bottom: 1px solid ${T.tdBorder}; letter-spacing: 1px; text-transform: uppercase;
    }
    table { width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 6px; }
    th {
      background: ${T.thBg} !important; color: ${T.thColor} !important;
      padding: 7px 10px; text-align: left; font-size: 10px;
      letter-spacing: 1px; text-transform: uppercase;
    }
    td { padding: 7px 10px; border-bottom: 1px solid ${T.tdBorder}; color: ${T.textColor}; }
    tr:last-child td { border-bottom: none; }
    tr:nth-child(even) td { background: ${T.tdAltBg} !important; }
    .section { margin-bottom: 18px; }
    .summary-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 6px; }
    .metric-box {
      background: ${T.metricBoxBg} !important; border: 1px solid ${T.metricBoxBdr};
      border-radius: 8px; padding: 10px; text-align: center;
    }
    .metric-box .val { font-size: 20px; font-weight: 800; color: ${T.metricValClr}; }
    .metric-box .lbl { font-size: 10px; color: ${T.mutedColor}; margin-top: 3px; }
    .disclaimer {
      background: ${T.disclaimerBg} !important; border: 1px solid ${T.disclaimerBdr};
      border-radius: 6px; padding: 10px 14px; font-size: 11px;
      color: ${T.disclaimerClr}; margin-top: 16px; line-height: 1.55;
    }
    .footer {
      position: fixed; bottom: 0; left: 0; right: 0;
      padding: 10px 40px; background: ${T.pageBg} !important;
      border-top: 1px solid ${T.footerBorder}; font-size: 10px; color: ${T.footerColor};
    }
    .footer-top { display: flex; justify-content: space-between; margin-bottom: 5px; }
    .footer-center {
      text-align: center; font-size: 11px; font-weight: 600; color: #1565C0;
      padding-top: 5px; border-top: 1px solid ${T.tdBorder}; letter-spacing: 0.3px;
    }
    * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; color-adjust: exact !important; }
    @media print {
      html, body { background: ${T.pageBg} !important; color: ${T.textColor} !important; }
      .metric-box    { background: ${T.metricBoxBg}  !important; }
      th             { background: ${T.thBg}          !important; color: ${T.thColor} !important; }
      tr:nth-child(even) td { background: ${T.tdAltBg} !important; }
      .disclaimer    { background: ${T.disclaimerBg}  !important; }
      .footer        { background: ${T.pageBg}         !important; }
    }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div class="logo-wrap">
        ${logoSVG}
        <div>
          <div class="logo-text"><span class="heal">Heal</span><span class="net">Net</span></div>
          <div class="logo-tagline">CLINICAL INTELLIGENCE</div>
        </div>
      </div>
      <div class="report-label">${reportType} Report</div>
    </div>
    <div class="meta">
      <div><strong>Generated:</strong> ${now}</div>
      <div><strong>Data source:</strong> ${src.replace("_", " ").replace(/\b\w/g, c => c.toUpperCase())}</div>
      <div><strong>Period:</strong> ${dateRange}</div>
      <div style="color:#1565C0; font-weight:600; margin-top:3px;">IoTrenetics Solutions Pvt. Ltd.</div>
    </div>
  </div>
  <div class="section">
    <h2>Summary Metrics</h2>
    <div class="summary-grid">
      ${metricRows.map(([label, value, unit]) => `
        <div class="metric-box">
          <div class="val">${value}</div>
          <div class="lbl">${label}<br/>
            <span style="font-size:9px; color:${T.mutedColor};">${unit}</span>
          </div>
        </div>`).join("")}
    </div>
  </div>
  <div class="section">
    <h2>Detailed Metrics</h2>
    <table>
      <thead><tr><th>Metric</th><th>Average Value</th><th>Unit</th><th>Status</th></tr></thead>
      <tbody>
        ${metricRows.map(([label, value, unit]) => {
          let status = "Normal";
          let statusStyle = "color:#27ae60; font-weight:600;";
          if (label.includes("Heart Rate") && value) {
            if (value > 120 || value < 40) { status = "Critical"; statusStyle = "color:#e74c3c; font-weight:700;"; }
            else if (value > 100 || value < 55) { status = "Warning"; statusStyle = "color:#f39c12; font-weight:700;"; }
          }
          if (label.includes("SpO2") && value) {
            if (value < 90) { status = "Critical"; statusStyle = "color:#e74c3c; font-weight:700;"; }
            else if (value < 95) { status = "Warning"; statusStyle = "color:#f39c12; font-weight:700;"; }
          }
          return `<tr>
            <td>${label}</td>
            <td style="font-weight:700;">${value}</td>
            <td style="color:${T.mutedColor};">${unit}</td>
            <td style="${statusStyle}">${status}</td>
          </tr>`;
        }).join("")}
      </tbody>
    </table>
  </div>
  <div class="section">
    <h2>Health Alerts</h2>
    <table>
      <thead><tr><th>Vital</th><th>Level</th><th>Value</th><th>Message</th></tr></thead>
      <tbody>${alertRows}</tbody>
    </table>
  </div>
  <div class="disclaimer">
    ⚠️ <strong>Medical Disclaimer:</strong> This report is generated for informational and
    monitoring purposes only. It is not a substitute for professional medical advice,
    diagnosis, or treatment. Please consult a qualified healthcare provider for any health
    concerns.
  </div>
  <div class="footer">
    <div class="footer-top">
      <div>HealNet · AI-Powered Healthcare Monitoring Platform</div>
      <div>IoTrenetics Solutions Pvt. Ltd. · Confidential</div>
    </div>
    <div class="footer-center">A product of IoTrenetics Solutions Private Limited</div>
  </div>
</body>
</html>`;
}

// ═══════════════════════════════════════════════════════════════════
//  PDF DOWNLOADER
// ═══════════════════════════════════════════════════════════════════
function downloadPDF(html, filename) {
  const iframe = document.createElement("iframe");
  iframe.style.cssText = "position:fixed;right:-9999px;bottom:0;width:1200px;height:800px;border:none;opacity:0;pointer-events:none;";
  document.body.appendChild(iframe);
  const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
  iframeDoc.open();
  iframeDoc.write(html);
  iframeDoc.close();
  iframe.onload = () => {
    setTimeout(() => {
      try {
        iframe.contentWindow.focus();
        iframe.contentWindow.print();
      } catch (e) {
        const win = window.open("", "_blank");
        if (win) {
          win.document.write(html);
          win.document.close();
          setTimeout(() => win.print(), 600);
        }
      }
      setTimeout(() => {
        if (document.body.contains(iframe)) document.body.removeChild(iframe);
      }, 3000);
    }, 600);
  };
}

// ═══════════════════════════════════════════════════════════════════
//  REPORTS TAB
// ═══════════════════════════════════════════════════════════════════
function ReportsTab({ latestResult, isOnline }) {
  const offline = !isOnline;
  const [reportType, setReportType]   = useState("Summary");
  const [dateRange, setDateRange]     = useState("Last 30 days");
  const [generating, setGenerating]   = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [darkMode, setDarkMode]       = useState(false);

  const reportTypes = [
    { id: "Summary",       icon: "📊", desc: "Averages, trends and overall health score" },
    { id: "Heart Rate",    icon: "❤️", desc: "Heart rate analysis with risk flags" },
    { id: "Activity",      icon: "🚶", desc: "Steps, calories and activity levels" },
    { id: "Sleep",         icon: "😴", desc: "Sleep duration and consistency" },
    { id: "Full Report",   icon: "📋", desc: "All vitals combined in one document" },
  ];

  const dateRanges = ["Last 7 days", "Last 14 days", "Last 30 days", "Last 60 days", "Last 90 days"];

  function handleDownload() {
    if (!latestResult) return;
    setGenerating(true);
    const html = generateReportHTML(latestResult, reportType, dateRange, darkMode);
    setTimeout(() => {
      downloadPDF(html, `healnet-${reportType.toLowerCase().replace(" ", "-")}-report.pdf`);
      setGenerating(false);
    }, 200);
  }

  function handlePreview() {
    if (!latestResult) return;
    setPreviewOpen(true);
  }

  const previewHtml = latestResult
    ? generateReportHTML(latestResult, reportType, dateRange, darkMode)
    : "";

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 6 }}>Reports & Alerts</div>
        <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.6 }}>
          Download a health summary as a PDF, or view real-time alerts based on your wearable data.
          {offline
            ? " Using your last-synced data since you're offline — PDF generation works fully offline."
            : " Load data from any source tab first, then generate a report here."}
        </div>
      </div>

      {/* ── Alerts ───────────────────────────────────────────── */}
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 22, marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
          <span style={{ fontSize: 20 }}>🚨</span>
          <div>
            <div style={{ fontWeight: 700, color: C.text, fontSize: 15, display: "flex", alignItems: "center" }}>
              Health Alerts
              {offline && latestResult && <OfflineDataBadge savedAt={latestResult.savedAt} isOnline={isOnline} />}
            </div>
            <div style={{ fontSize: 12, color: C.muted }}>
              {offline ? "Calculated locally from your last-synced data" : "Auto-generated from your loaded wearable data"}
            </div>
          </div>
        </div>
        <AlertsPanel summary={latestResult?.summary} offline={offline} />
      </div>

      {/* ── Report generator ─────────────────────────────────── */}
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 22 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 20 }}>📄</span>
            <div>
              <div style={{ fontWeight: 700, color: C.text, fontSize: 15 }}>Download PDF Report</div>
              <div style={{ fontSize: 12, color: C.muted }}>Choose a report type and time range, then download</div>
            </div>
          </div>
          <button
            onClick={() => setDarkMode(d => !d)}
            style={{
              padding: "8px 18px", borderRadius: 10,
              border: `1px solid ${darkMode ? C.accent : C.border}`,
              background: darkMode ? "rgba(59,201,232,0.12)" : "rgba(59,201,232,0.04)",
              color: darkMode ? C.accent : C.muted,
              fontWeight: 600, fontSize: 13, cursor: "pointer",
              display: "flex", alignItems: "center", gap: 6,
              transition: "all 0.2s",
            }}
          >
            {darkMode ? "🌙 Dark Theme" : "☀️ Light Theme"}
          </button>
        </div>

        {offline && latestResult && (
          <div style={{
            background: "rgba(255,209,102,0.08)",
            border: "1px solid rgba(255,209,102,0.3)",
            borderRadius: 8, padding: "8px 14px",
            fontSize: 12, color: C.warn, marginBottom: 14,
            display: "flex", alignItems: "center", flexWrap: "wrap",
          }}>
            📵 Offline — PDF generation uses your cached data and works fully offline.
            <OfflineDataBadge savedAt={latestResult.savedAt} isOnline={isOnline} />
          </div>
        )}

        <div style={{ fontSize: 12, color: C.muted, marginBottom: 10, fontWeight: 600, letterSpacing: 1, textTransform: "uppercase" }}>
          Report Type
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 10, marginBottom: 20 }}>
          {reportTypes.map(r => (
            <button key={r.id} onClick={() => setReportType(r.id)} style={{
              padding: "12px 14px", borderRadius: 12, border: "none",
              background: reportType === r.id ? `${C.accent}22` : "rgba(59,201,232,0.05)",
              borderLeft: reportType === r.id ? `3px solid ${C.accent}` : `3px solid transparent`,
              color: reportType === r.id ? C.accent : C.muted,
              textAlign: "left", cursor: "pointer",
            }}>
              <div style={{ fontSize: 20, marginBottom: 4 }}>{r.icon}</div>
              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 2 }}>{r.id}</div>
              <div style={{ fontSize: 11, lineHeight: 1.4 }}>{r.desc}</div>
            </button>
          ))}
        </div>

        <div style={{ fontSize: 12, color: C.muted, marginBottom: 8, fontWeight: 600, letterSpacing: 1, textTransform: "uppercase" }}>
          Date Range
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 24 }}>
          {dateRanges.map(d => (
            <button key={d} onClick={() => setDateRange(d)} style={{
              padding: "7px 16px", borderRadius: 8, border: "none",
              background: dateRange === d ? `${C.accent}22` : "rgba(59,201,232,0.05)",
              color: dateRange === d ? C.accent : C.muted,
              fontWeight: 600, fontSize: 13, cursor: "pointer",
              outline: dateRange === d ? `1px solid ${C.accent}44` : "none",
            }}>{d}</button>
          ))}
        </div>

        {!latestResult && (
          <div style={{ background: "rgba(255,209,102,0.08)", border: `1px solid ${C.warn}33`, borderRadius: 10, padding: "12px 16px", marginBottom: 18, fontSize: 13, color: C.warn }}>
            {offline
              ? "📵 No cached data available offline. Connect once while online to enable offline reports."
              : "⚡ Load data from a source tab first (CSV, Google Fit, or Apple Health) to enable report generation."}
          </div>
        )}

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <button
            onClick={handleDownload}
            disabled={!latestResult || generating}
            style={{
              padding: "13px 32px", borderRadius: 12, border: "none",
              background: !latestResult ? "rgba(59,201,232,0.15)" : `linear-gradient(135deg, ${C.accent}, #0099bb)`,
              color: !latestResult ? C.muted : C.bg,
              fontWeight: 700, fontSize: 15, cursor: !latestResult ? "not-allowed" : "pointer",
              display: "flex", alignItems: "center", gap: 8,
            }}
          >
            {generating ? "⏳ Opening..." : "⬇️ Download PDF"}
          </button>
          <button
            onClick={handlePreview}
            disabled={!latestResult}
            style={{
              padding: "13px 28px", borderRadius: 12,
              border: `1px solid ${!latestResult ? C.border : C.accent}`,
              background: "none",
              color: !latestResult ? C.muted : C.accent,
              fontWeight: 600, fontSize: 15, cursor: !latestResult ? "not-allowed" : "pointer",
            }}
          >
            👁️ Preview
          </button>
        </div>

        <div style={{ marginTop: 14, fontSize: 12, color: C.muted, lineHeight: 1.6 }}>
          📌 The PDF opens via the print dialog. Use your browser's <strong style={{ color: C.text }}>Save as PDF</strong> destination to save the file.
          {offline && <><br/>📦 Working from cached data — PDF generation works fully offline.</>}
        </div>
      </div>

      {/* ── Preview modal ─────────────────────────────────────── */}
      {previewOpen && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 300,
          background: "rgba(3,12,44,0.92)",
          display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center",
          padding: 20,
        }}>
          <div style={{
            width: "100%", maxWidth: 860,
            background: "#fff", borderRadius: 16,
            overflow: "hidden", display: "flex", flexDirection: "column",
            maxHeight: "90vh",
          }}>
            <div style={{
              background: C.card, padding: "14px 20px",
              display: "flex", justifyContent: "space-between", alignItems: "center",
              borderBottom: `1px solid ${C.border}`,
            }}>
              <div style={{ color: C.accent, fontWeight: 700, fontSize: 14 }}>
                📄 Preview — {reportType} Report {darkMode ? "🌙" : "☀️"}
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={handleDownload} style={{
                  padding: "7px 18px", borderRadius: 8, border: "none",
                  background: C.accent, color: C.bg, fontWeight: 700, fontSize: 13, cursor: "pointer",
                }}>⬇️ Download</button>
                <button onClick={() => setPreviewOpen(false)} style={{
                  padding: "7px 14px", borderRadius: 8,
                  border: `1px solid ${C.border}`, background: "none",
                  color: C.muted, fontSize: 13, cursor: "pointer",
                }}>✕ Close</button>
              </div>
            </div>
            <iframe
              srcDoc={previewHtml}
              title="Report Preview"
              style={{ flex: 1, border: "none", background: "#fff" }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
//  MAIN PAGE
// ═══════════════════════════════════════════════════════════════════
export default function SmartWatchPage({ patients }) {
  const [tab, setTab]             = useState("csv");
  const [selPatient, setSelPatient] = useState("");
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState("");
  const [result, setResult]       = useState(null);
  const [fitStatus, setFitStatus] = useState(null);
  const [fitToken, setFitToken]   = useState(() => {
    try { return JSON.parse(localStorage.getItem("google_fit_token")); } catch { return null; }
  });
  const [days, setDays] = useState(30);
  const fileRef = useRef();

  const { isOnline } = useNetwork();
  const offline = !isOnline;

  // Hydrate last-synced result from cache on mount (so Reports/Alerts work offline immediately)
  const [lastResult, setLastResult] = useState(() => getCachedWearableResult());

  function setResultAndCache(r) {
    setResult(r);
    if (r) {
      setLastResult(r);
      cacheWearableResult(r);
    }
  }

  useEffect(() => {
    if (offline) {
      setFitStatus(getCachedGeneric("google_fit_status") || { configured: false });
      return;
    }
    smartwatchAPI.googleFitStatus()
      .then(r => { setFitStatus(r.data); cacheGeneric("google_fit_status", r.data); })
      .catch(() => setFitStatus({ configured: false }));
  }, [offline]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code   = params.get("code");
    if (code && !fitToken) {
      setTab("googlefit"); setLoading(true);
      smartwatchAPI.googleFitExchange(code)
        .then(r => {
          const token = r.data;
          localStorage.setItem("google_fit_token", JSON.stringify(token));
          setFitToken(token);
          window.history.replaceState({}, "", window.location.pathname);
          return smartwatchAPI.googleFitData(token, days);
        })
        .then(r => { setResultAndCache(r.data); setLoading(false); })
        .catch(e => { setError(e.response?.data?.detail || "Google Fit error"); setLoading(false); });
    }
  }, []);

  async function handleCSV(e) {
    const file = e.target.files[0]; if (!file) return;
    if (!selPatient) { setError("Select a patient first, so this data can be saved to their record."); return; }
    // CSV upload requires a backend parse call — needs connectivity
    if (offline) { setError("CSV upload requires an internet connection to parse the file."); return; }
    setLoading(true); setError(""); setResult(null);
    try { const res = await smartwatchAPI.uploadCSV(file, selPatient); setResultAndCache(res.data); }
    catch (err) { setError(err.response?.data?.detail || "Failed to parse CSV"); }
    setLoading(false);
  }

  async function connectGoogleFit() {
    if (offline) { setError("Connecting Google Fit requires an internet connection."); return; }
    setLoading(true); setError("");
    try { const res = await smartwatchAPI.googleFitAuthUrl(); window.location.href = res.data.auth_url; }
    catch (e) { setError(e.response?.data?.detail || "Could not get auth URL"); setLoading(false); }
  }

  async function fetchGoogleFitData() {
    if (!fitToken) return;
    if (!selPatient) { setError("Select a patient first, so this data can be saved to their record."); return; }

    if (offline) {
      // Show cached result if we have one
      if (lastResult && lastResult.source === "google_fit") {
        setResult({ ...lastResult, _fromCache: true });
      } else {
        setError("You're offline and no cached Google Fit data is available.");
      }
      return;
    }

    setLoading(true); setError(""); setResult(null);
    try {
      const res = await smartwatchAPI.googleFitData(fitToken, days, selPatient);
      setResultAndCache(res.data);
      if (res.data.token) {
        localStorage.setItem("google_fit_token", JSON.stringify(res.data.token));
        setFitToken(res.data.token);
      }
    } catch (e) {
      // Network failure — fall back to cache
      if (!e.response && lastResult?.source === "google_fit") {
        setResult({ ...lastResult, _fromCache: true });
      } else {
        setError(e.response?.data?.detail || "Failed to fetch data");
      }
    }
    setLoading(false);
  }

  function disconnectGoogleFit() {
    localStorage.removeItem("google_fit_token"); setFitToken(null); setResult(null);
  }

  const tabs = [
    { id: "csv",         label: "📂 CSV Upload"   },
    { id: "googlefit",   label: "🏃 Google Fit" + (fitToken ? " ✅" : "") },
    { id: "applehealth", label: "🍎 Apple Health" },
    { id: "reports",     label: "📋 Reports"       },
  ];

  return (
    <div style={{ fontFamily: "'Segoe UI', sans-serif", color: C.text }}>
      <h2 style={{ margin: "0 0 6px", fontSize: 22 }}>⌚ Smartwatch Data</h2>
      <p style={{ color: C.muted, fontSize: 14, marginBottom: 16 }}>
        Upload CSV from your smartwatch or connect Google Fit / Apple Health for automatic sync.
      </p>

      {/* Offline status is shown globally by the app-root OfflineBanner */}

      {/* ── Patient selector — required so synced data is saved against a specific patient ── */}
      <select value={selPatient} onChange={e => setSelPatient(e.target.value)}
        style={{
          width: "100%", padding: "10px 16px", borderRadius: 10,
          background: "rgba(59,201,232,0.07)", border: `1px solid ${C.border}`,
          color: C.text, fontSize: 14, outline: "none",
          boxSizing: "border-box", marginBottom: 20,
        }}>
        <option value="">— Select a patient to sync data for —</option>
        {(patients || []).map(p => (
          <option key={p.patient_id} value={p.patient_id}>{p.name} ({p.patient_id})</option>
        ))}
      </select>
      {!selPatient && (
        <div style={{
          background: "rgba(255,209,102,0.08)", border: `1px solid ${C.warn}33`,
          borderRadius: 10, padding: "10px 16px", marginBottom: 20, fontSize: 13, color: C.warn,
        }}>
          ⚠️ Select a patient above before uploading or syncing — otherwise data won't be saved to anyone's record.
        </div>
      )}

      {/* Tab bar */}
      <div style={{ display: "flex", gap: 8, marginBottom: 24, flexWrap: "wrap" }}>
        {tabs.map(t => {
          const isReports = t.id === "reports";
          const isApple   = t.id === "applehealth";
          const isActive  = tab === t.id;
          const activeBg  = isReports
            ? `linear-gradient(135deg, ${C.accent}cc, #0099bbcc)`
            : isApple ? C.apple : C.accent;
          return (
            <button key={t.id} onClick={() => { setTab(t.id); setResult(null); setError(""); }} style={{
              padding: "10px 20px", borderRadius: 10, border: "none",
              background: isActive ? activeBg : "rgba(59,201,232,0.08)",
              color: isActive ? (isApple ? "#fff" : C.bg) : C.muted,
              fontWeight: 600, fontSize: 14, cursor: "pointer",
              position: "relative",
            }}>
              {t.label}
              {isReports && lastResult && !isActive && (
                <span style={{
                  position: "absolute", top: 6, right: 6,
                  width: 8, height: 8, borderRadius: "50%",
                  background: C.accent2,
                }} />
              )}
            </button>
          );
        })}
      </div>

      {/* ══ CSV TAB ══════════════════════════════════════════════ */}
      {tab === "csv" && (
        <div>
          <div style={{ background: "rgba(59,201,232,0.04)", border: `1px solid ${C.border}`, borderRadius: 14, padding: 20, marginBottom: 20 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.accent, marginBottom: 12 }}>📖 How to export from your smartwatch</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 16, fontSize: 13, color: C.muted, lineHeight: 1.8 }}>
              <div><div style={{ color: C.text, fontWeight: 600, marginBottom: 4 }}>🍎 Apple Watch</div>Health app → Tap profile → Export All Health Data → Upload CSV</div>
              <div><div style={{ color: C.text, fontWeight: 600, marginBottom: 4 }}>📱 Samsung Galaxy Watch</div>Samsung Health → Settings → Download personal data → Upload CSV</div>
              <div><div style={{ color: C.text, fontWeight: 600, marginBottom: 4 }}>🏃 Fitbit</div>fitbit.com → Settings → Export Account Archive → Upload CSV</div>
              <div><div style={{ color: C.text, fontWeight: 600, marginBottom: 4 }}>🤖 Google Fit</div>takeout.google.com → Select Fit → Download → Upload CSV</div>
            </div>
          </div>
          <div onClick={() => !offline && fileRef.current.click()} style={{
            border: `2px dashed ${C.border}`, borderRadius: 14, padding: "48px 20px",
            textAlign: "center", cursor: offline ? "not-allowed" : "pointer", marginBottom: 20,
            background: "rgba(59,201,232,0.03)", opacity: offline ? 0.5 : 1,
            transition: "border-color 0.2s",
          }}>
            <input ref={fileRef} type="file" accept=".csv" onChange={handleCSV} style={{ display: "none" }} disabled={offline} />
            <div style={{ fontSize: 48, marginBottom: 12 }}>⌚</div>
            <div style={{ color: C.text, fontWeight: 600, fontSize: 16, marginBottom: 6 }}>
              {offline ? "Upload unavailable offline" : "Click to upload smartwatch CSV"}
            </div>
            <div style={{ color: C.muted, fontSize: 13 }}>
              {offline ? "Reconnect to upload and parse a new CSV file" : "Supports Apple Watch, Samsung, Fitbit, Garmin, Google Fit exports"}
            </div>
          </div>
          {loading && <div style={{ color: C.accent, textAlign: "center", padding: 20 }}>📊 Parsing your health data...</div>}
          {error   && <div style={{ color: C.danger, padding: 16, background: "rgba(255,77,109,0.1)", borderRadius: 10, marginBottom: 16 }}>⚠️ {error}</div>}
          {!result && offline && lastResult && (
            <div style={{ background: "rgba(255,209,102,0.08)", border: `1px solid ${C.warn}33`, borderRadius: 10, padding: "12px 16px", marginBottom: 16, fontSize: 13, color: C.warn }}>
              📦 Showing your last-synced data below (offline).
            </div>
          )}
          {(result || (offline && lastResult)) && (
            <>
              <ResultsPanel result={result || { ...lastResult, _fromCache: true }} />
              <button onClick={() => setTab("reports")} style={{
                marginTop: 20, padding: "10px 24px", borderRadius: 10, border: "none",
                background: `${C.accent}22`, color: C.accent, fontWeight: 600,
                fontSize: 13, cursor: "pointer",
              }}>
                📋 Go to Reports & Alerts →
              </button>
            </>
          )}
        </div>
      )}

      {/* ══ GOOGLE FIT TAB ══════════════════════════════════════ */}
      {tab === "googlefit" && (
        <div>
          {fitStatus && !fitStatus.configured && (
            <div style={{ background: C.card, border: `1px solid ${C.warn}44`, borderRadius: 14, padding: 32, textAlign: "center" }}>
              <div style={{ fontSize: 40, marginBottom: 16 }}>⚙️</div>
              <h3 style={{ color: C.warn, margin: "0 0 12px" }}>Google Fit Setup Required</h3>
              <p style={{ color: C.muted, fontSize: 14, marginBottom: 24, lineHeight: 1.7 }}>Add these to your Railway environment variables:</p>
              <div style={{ background: "rgba(0,0,0,0.3)", borderRadius: 10, padding: 16, textAlign: "left", marginBottom: 24, fontFamily: "monospace", fontSize: 13 }}>
                <div style={{ color: C.accent2, marginBottom: 8 }}>GOOGLE_CLIENT_ID = your-client-id</div>
                <div style={{ color: C.accent2, marginBottom: 8 }}>GOOGLE_CLIENT_SECRET = your-client-secret</div>
                <div style={{ color: C.accent2 }}>GOOGLE_REDIRECT_URI = https://healnet-web.vercel.app/google-callback</div>
              </div>
            </div>
          )}
          {fitStatus?.configured && !fitToken && (
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 40, textAlign: "center" }}>
              <div style={{ fontSize: 56, marginBottom: 16 }}>🏃</div>
              <h3 style={{ color: C.accent, margin: "0 0 12px", fontSize: 20 }}>Connect Google Fit</h3>
              <p style={{ color: C.muted, fontSize: 14, marginBottom: 32, lineHeight: 1.6 }}>Sync heart rate, steps, sleep, and calories in real-time.</p>
              <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap", marginBottom: 24 }}>
                {["❤️ Heart Rate", "🚶 Steps", "😴 Sleep", "🔥 Calories"].map(label => (
                  <span key={label} style={{ background: "rgba(59,201,232,0.1)", color: C.accent, padding: "6px 16px", borderRadius: 20, fontSize: 13 }}>{label}</span>
                ))}
              </div>
              <button onClick={connectGoogleFit} disabled={loading || offline} style={{ padding: "14px 40px", borderRadius: 12, border: "none", background: (loading || offline) ? "rgba(59,201,232,0.3)" : C.accent, color: C.bg, fontWeight: 700, fontSize: 16, cursor: (loading || offline) ? "not-allowed" : "pointer" }}>
                {loading ? "Connecting..." : offline ? "📵 Offline" : "🔗 Connect Google Fit"}
              </button>
              {error && <div style={{ color: C.danger, marginTop: 16, fontSize: 13 }}>⚠️ {error}</div>}
            </div>
          )}
          {fitStatus?.configured && fitToken && (
            <div>
              <div style={{ background: "rgba(0,245,160,0.08)", border: `1px solid ${C.accent2}44`, borderRadius: 12, padding: "12px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
                <div style={{ color: C.accent2, fontWeight: 600 }}>✅ Google Fit Connected</div>
                <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                  <select value={days} onChange={e => setDays(Number(e.target.value))} style={{ padding: "6px 12px", borderRadius: 8, background: "rgba(59,201,232,0.07)", border: `1px solid ${C.border}`, color: C.text, fontSize: 13, outline: "none" }}>
                    {[7, 14, 30, 60, 90].map(d => <option key={d} value={d}>Last {d} days</option>)}
                  </select>
                  <button onClick={fetchGoogleFitData} disabled={loading} style={{ padding: "7px 18px", borderRadius: 8, border: "none", background: C.accent, color: C.bg, fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
                    {loading ? "Fetching..." : offline ? "📦 Load Cached" : "🔄 Refresh Data"}
                  </button>
                  <button onClick={disconnectGoogleFit} disabled={offline} style={{ padding: "7px 18px", borderRadius: 8, border: `1px solid ${C.danger}44`, background: "none", color: offline ? `${C.danger}66` : C.danger, fontSize: 13, cursor: offline ? "not-allowed" : "pointer" }}>Disconnect</button>
                </div>
              </div>
              {loading && <div style={{ color: C.accent, textAlign: "center", padding: 20 }}>📡 Fetching from Google Fit...</div>}
              {error   && <div style={{ color: C.danger, padding: 16, background: "rgba(255,77,109,0.1)", borderRadius: 10, marginBottom: 16 }}>⚠️ {error}</div>}
              {!result && !loading && (
                <div style={{ textAlign: "center", padding: 40 }}>
                  <button onClick={fetchGoogleFitData} style={{ padding: "14px 40px", borderRadius: 12, border: "none", background: C.accent, color: C.bg, fontWeight: 700, fontSize: 16, cursor: "pointer" }}>
                    {offline ? "📦 Load Cached Data" : "📡 Load Google Fit Data"}
                  </button>
                </div>
              )}
              {result && (
                <>
                  <ResultsPanel result={result} />
                  <button onClick={() => setTab("reports")} style={{
                    marginTop: 20, padding: "10px 24px", borderRadius: 10, border: "none",
                    background: `${C.accent}22`, color: C.accent, fontWeight: 600,
                    fontSize: 13, cursor: "pointer",
                  }}>
                    📋 Go to Reports & Alerts →
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* ══ APPLE HEALTH TAB ════════════════════════════════════ */}
      {tab === "applehealth" && <AppleHealthTab />}

      {/* ══ REPORTS TAB ═════════════════════════════════════════ */}
      {tab === "reports" && <ReportsTab latestResult={lastResult} isOnline={isOnline} />}
    </div>
  );
}