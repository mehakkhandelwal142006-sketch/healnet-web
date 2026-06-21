import { useState, useRef, useEffect } from "react";
import { smartwatchAPI, appleHealthAPI } from "../services/api";
import {
  LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from "recharts";

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

  const user   = (() => { try { return JSON.parse(localStorage.getItem("healnet_user")); } catch { return null; } })();
  const userId = user?.id || user?.email || "";
  const webhookUrl = `https://healnet-web-production.up.railway.app/api/apple-health/webhook?user_id=${userId}`;

  async function loadData() {
    if (!userId) return;
    setLoading(true); setError("");
    try {
      const res = await appleHealthAPI.getData(userId, days);
      setAhData(res.data);
    } catch (e) {
      setError(e.response?.data?.detail || "Failed to load Apple Health data");
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
      <button onClick={loadData} style={{ marginTop: 12, padding: "10px 28px", borderRadius: 10, border: `1px solid ${C.border}`, background: "none", color: C.muted, fontSize: 13, cursor: "pointer" }}>
        🔄 Check again after syncing
      </button>
    </div>
  );

  return (
    <div>
      <div style={{ background: "rgba(252,61,57,0.08)", border: "1px solid rgba(252,61,57,0.3)", borderRadius: 12, padding: "12px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div style={{ color: C.apple, fontWeight: 600 }}>🍎 Apple Health Connected</div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <select value={days} onChange={e => setDays(Number(e.target.value))} style={{ padding: "6px 12px", borderRadius: 8, background: "rgba(59,201,232,0.07)", border: `1px solid ${C.border}`, color: C.text, fontSize: 13, outline: "none" }}>
            {[7, 14, 30, 60, 90].map(d => <option key={d} value={d}>Last {d} days</option>)}
          </select>
          <button onClick={loadData} disabled={loading} style={{ padding: "7px 18px", borderRadius: 8, border: "none", background: C.apple, color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
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
//  ALERTS PANEL  (used inside Reports tab)
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

function AlertsPanel({ summary }) {
  const alerts = evaluateAlerts(summary);

  if (!summary) return (
    <div style={{ background: "rgba(59,201,232,0.04)", border: `1px dashed ${C.border}`, borderRadius: 12, padding: 32, textAlign: "center", color: C.muted, fontSize: 14 }}>
      Load data from CSV, Google Fit, or Apple Health to see alerts.
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
//  PDF REPORT GENERATOR  — FIXED: dark theme prints correctly
// ═══════════════════════════════════════════════════════════════════

// HealNet SVG Logo (inline, works in both themes)
const HEALNET_LOGO_SVG = `<svg width="52" height="52" viewBox="0 0 52 52" xmlns="http://www.w3.org/2000/svg" style="flex-shrink:0;border-radius:12px;">
  <defs>
    <linearGradient id="lgrd" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#3BC9E8"/>
      <stop offset="100%" stop-color="#0099bb"/>
    </linearGradient>
  </defs>
  <rect width="52" height="52" rx="12" fill="url(#lgrd)"/>
  <circle cx="26" cy="20" r="8" fill="none" stroke="#fff" stroke-width="2.5"/>
  <path d="M26 28 Q26 38 34 38" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round"/>
  <circle cx="34" cy="38" r="3" fill="#fff"/>
  <polyline points="19,20 22,14 24,24 27,16 29,22 33,20" fill="none" stroke="#030c2c" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

function generateReportHTML(result, reportType, dateRange, darkMode = false) {
  const s   = result?.summary || {};
  const src = result?.source  || "Unknown";
  const now = new Date().toLocaleString();
  const alerts = evaluateAlerts(s);

  // ── Theme tokens ──────────────────────────────────────────────
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
    footerDivider:"#0d2a4a",
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
    footerDivider:"#e0e0e0",
  };

  const alertRows = alerts.length > 0
    ? alerts.map(a => `
        <tr>
          <td style="padding:9px 12px;border-bottom:1px solid ${T.tdBorder};color:${T.textColor};">${ALERT_META[a.vital]?.icon || "⚠️"} ${ALERT_META[a.vital]?.label || a.vital}</td>
          <td style="padding:9px 12px;border-bottom:1px solid ${T.tdBorder};color:${a.level === "danger" ? "#e74c3c" : "#f39c12"};font-weight:600;">${a.level === "danger" ? "Critical" : "Warning"}</td>
          <td style="padding:9px 12px;border-bottom:1px solid ${T.tdBorder};color:${T.textColor};">${a.value} ${a.vital === "heart_rate" ? "bpm" : a.vital === "spo2" ? "%" : "mmHg"}</td>
          <td style="padding:9px 12px;border-bottom:1px solid ${T.tdBorder};color:${T.mutedColor};">${a.message}</td>
        </tr>`).join("")
    : `<tr><td colspan="4" style="padding:14px 12px;text-align:center;color:#27ae60;font-style:italic;">✅ No abnormal readings detected</td></tr>`;

  const metricRows = [
    ["❤️ Average Heart Rate", s.avg_heart_rate, "bpm"],
    ["🚶 Average Steps",       s.avg_steps,       "steps/day"],
    ["🫁 Average SpO2",         s.avg_spo2,        "%"],
    ["😴 Average Sleep",        s.avg_sleep,       "hours"],
    ["🔥 Average Calories",     s.avg_calories,    "kcal"],
  ].filter(([, v]) => v !== null && v !== undefined);

  // KEY FIX: print-color-adjust forces browsers to print background colors
  // We also embed the full page as a self-contained HTML with all styles inline
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>HealNet Health Report</title>
  <style>
    /* ── CRITICAL: Force background colors to print in all browsers ── */
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
      font-family: 'Segoe UI', Arial, sans-serif;
      -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
      color-adjust: exact !important;
    }
    html, body {
      background: ${T.pageBg} !important;
      color: ${T.textColor} !important;
      margin: 0;
      padding: 0;
    }
    table { border-collapse: collapse; width: 100%; }

    @media print {
      html, body {
        background: ${T.pageBg} !important;
        -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
      }
      .page-wrap {
        background: ${T.pageBg} !important;
        padding: 20px !important;
      }
      /* Force all colored backgrounds to print */
      div, td, th, span, p {
        -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
      }
    }
  </style>
</head>
<body style="margin:0;padding:0;background:${T.pageBg};">
<div class="page-wrap" style="background:${T.pageBg};color:${T.textColor};padding:40px;min-height:100vh;">

  <!-- ══ HEADER with HealNet Logo ══════════════════════════════════ -->
  <div style="border-bottom:3px solid ${T.headerBorder};padding-bottom:20px;margin-bottom:28px;display:flex;justify-content:space-between;align-items:flex-end;flex-wrap:wrap;gap:16px;">
    <div>
      <!-- Logo + Wordmark -->
      <div style="display:flex;align-items:center;gap:14px;margin-bottom:8px;">
        ${HEALNET_LOGO_SVG}
        <div>
          <div style="font-size:30px;font-weight:800;color:${T.logoColor};letter-spacing:-0.5px;line-height:1;">
            Heal<span style="color:#3BC9E8;">Net</span>
          </div>
          <div style="font-size:11px;color:${T.mutedColor};margin-top:3px;letter-spacing:0.5px;">
            AI-Powered Healthcare Monitoring Platform
          </div>
        </div>
      </div>
      <div style="font-size:13px;color:${T.mutedColor};margin-top:4px;">
        ${reportType} Report &nbsp;·&nbsp;
        <span style="color:${darkMode ? "#3BC9E8" : "#030c2c"};font-weight:600;">
          ${darkMode ? "🌙 Dark Theme" : "☀️ Light Theme"}
        </span>
      </div>
    </div>
    <div style="text-align:right;font-size:12px;color:${T.mutedColor};line-height:1.9;">
      <div><span style="color:${T.textColor};font-weight:600;">Generated:</span> ${now}</div>
      <div><span style="color:${T.textColor};font-weight:600;">Data source:</span> ${src.replace("_", " ").replace(/\b\w/g, c => c.toUpperCase())}</div>
      <div><span style="color:${T.textColor};font-weight:600;">Period:</span> ${dateRange}</div>
      <div style="color:#3BC9E8;font-weight:700;margin-top:4px;">IoTrenetics Solutions Pvt. Ltd.</div>
    </div>
  </div>

  <!-- ══ SUMMARY METRICS ════════════════════════════════════════════ -->
  <div style="margin-bottom:28px;">
    <h2 style="font-size:12px;font-weight:700;color:${T.headingColor};margin:0 0 12px;padding-bottom:6px;border-bottom:1px solid ${T.tdBorder};letter-spacing:1.5px;text-transform:uppercase;">
      Summary Metrics
    </h2>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:14px;">
      ${metricRows.map(([label, value, unit]) => `
        <div style="background:${T.metricBoxBg};border:1px solid ${T.metricBoxBdr};border-radius:10px;padding:16px;text-align:center;">
          <div style="font-size:26px;font-weight:800;color:${T.metricValClr};margin-bottom:6px;">${value}</div>
          <div style="font-size:11px;color:${T.mutedColor};line-height:1.5;">${label}<br/><span style="font-size:10px;opacity:0.8;">${unit}</span></div>
        </div>`).join("")}
    </div>
  </div>

  <!-- ══ DETAILED METRICS ═══════════════════════════════════════════ -->
  <div style="margin-bottom:28px;">
    <h2 style="font-size:12px;font-weight:700;color:${T.headingColor};margin:0 0 12px;padding-bottom:6px;border-bottom:1px solid ${T.tdBorder};letter-spacing:1.5px;text-transform:uppercase;">
      Detailed Metrics
    </h2>
    <table>
      <thead>
        <tr>
          ${["Metric","Average Value","Unit","Status"].map(h =>
            `<th style="background:${T.thBg};color:${T.thColor};padding:10px 12px;text-align:left;font-size:11px;letter-spacing:1px;text-transform:uppercase;">${h}</th>`
          ).join("")}
        </tr>
      </thead>
      <tbody>
        ${metricRows.map(([label, value, unit], i) => {
          let status = "Normal", statusColor = "#27ae60";
          if (label.includes("Heart Rate") && value) {
            if (value > 120 || value < 40)  { status = "Critical"; statusColor = "#e74c3c"; }
            else if (value > 100 || value < 55) { status = "Warning";  statusColor = "#f39c12"; }
          }
          if (label.includes("SpO2") && value) {
            if (value < 90)  { status = "Critical"; statusColor = "#e74c3c"; }
            else if (value < 95) { status = "Warning";  statusColor = "#f39c12"; }
          }
          const rowBg = i % 2 === 1 ? T.tdAltBg : T.pageBg;
          return `<tr>
            <td style="padding:10px 12px;border-bottom:1px solid ${T.tdBorder};color:${T.textColor};background:${rowBg};">${label}</td>
            <td style="padding:10px 12px;border-bottom:1px solid ${T.tdBorder};color:${T.textColor};background:${rowBg};font-weight:700;">${value}</td>
            <td style="padding:10px 12px;border-bottom:1px solid ${T.tdBorder};color:${T.mutedColor};background:${rowBg};">${unit}</td>
            <td style="padding:10px 12px;border-bottom:1px solid ${T.tdBorder};background:${rowBg};color:${statusColor};font-weight:700;">${status}</td>
          </tr>`;
        }).join("")}
      </tbody>
    </table>
  </div>

  <!-- ══ HEALTH ALERTS ══════════════════════════════════════════════ -->
  <div style="margin-bottom:28px;">
    <h2 style="font-size:12px;font-weight:700;color:${T.headingColor};margin:0 0 12px;padding-bottom:6px;border-bottom:1px solid ${T.tdBorder};letter-spacing:1.5px;text-transform:uppercase;">
      Health Alerts
    </h2>
    <table>
      <thead>
        <tr>
          ${["Vital","Level","Value","Message"].map(h =>
            `<th style="background:${T.thBg};color:${T.thColor};padding:10px 12px;text-align:left;font-size:11px;letter-spacing:1px;text-transform:uppercase;">${h}</th>`
          ).join("")}
        </tr>
      </thead>
      <tbody>${alertRows}</tbody>
    </table>
  </div>

  <!-- ══ DISCLAIMER ════════════════════════════════════════════════ -->
  <div style="background:${T.disclaimerBg};border:1px solid ${T.disclaimerBdr};border-radius:8px;padding:14px 18px;font-size:12px;color:${T.disclaimerClr};line-height:1.7;margin-bottom:36px;">
    ⚠️ <strong>Medical Disclaimer:</strong> This report is generated for informational and monitoring purposes only.
    It is not a substitute for professional medical advice, diagnosis, or treatment.
    Please consult a qualified healthcare provider for any health concerns.
  </div>

  <!-- ══ FOOTER ════════════════════════════════════════════════════ -->
  <div style="padding-top:16px;border-top:1px solid ${T.footerBorder};">
    <div style="display:flex;justify-content:space-between;align-items:center;font-size:11px;color:${T.footerColor};margin-bottom:14px;flex-wrap:wrap;gap:8px;">
      <div>HealNet &nbsp;·&nbsp; AI-Powered Healthcare Monitoring Platform</div>
      <div>IoTrenetics Solutions Pvt. Ltd. &nbsp;·&nbsp; Confidential</div>
    </div>
    <!-- Centre-bottom branding — required -->
    <div style="text-align:center;padding:12px 0 4px;border-top:1px solid ${T.footerDivider};">
      <span style="font-size:12px;font-weight:700;color:#3BC9E8;letter-spacing:0.4px;">
        A product of IoTrenetics Solutions Private Limited
      </span>
    </div>
  </div>

</div><!-- /.page-wrap -->
</body>
</html>`;
}

// ── Download helper — saves as .html so inline styles print correctly ──
function downloadReport(html, filename) {
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = filename.replace(/\.pdf$/, ".html");
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 3000);
}

// ═══════════════════════════════════════════════════════════════════
//  REPORTS TAB
// ═══════════════════════════════════════════════════════════════════
function ReportsTab({ latestResult }) {
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
      downloadReport(html, `healnet-${reportType.toLowerCase().replace(/ /g, "-")}-report.html`);
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
          Load data from any source tab first, then generate a report here.
        </div>
      </div>

      {/* ── Alerts section ───────────────────────────────────── */}
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 22, marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
          <span style={{ fontSize: 20 }}>🚨</span>
          <div>
            <div style={{ fontWeight: 700, color: C.text, fontSize: 15 }}>Health Alerts</div>
            <div style={{ fontSize: 12, color: C.muted }}>Auto-generated from your loaded wearable data</div>
          </div>
        </div>
        <AlertsPanel summary={latestResult?.summary} />
      </div>

      {/* ── Report generator ─────────────────────────────────── */}
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 22 }}>

        {/* Header + dark mode toggle */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 20 }}>📄</span>
            <div>
              <div style={{ fontWeight: 700, color: C.text, fontSize: 15 }}>Download Report</div>
              <div style={{ fontSize: 12, color: C.muted }}>Choose a report type and time range, then download</div>
            </div>
          </div>

          {/* Theme toggle */}
          <button
            onClick={() => setDarkMode(d => !d)}
            title={darkMode ? "Switch to Light Theme" : "Switch to Dark Theme"}
            style={{
              padding: "8px 18px", borderRadius: 10,
              border: `1px solid ${darkMode ? C.accent : C.border}`,
              background: darkMode ? "rgba(59,201,232,0.15)" : "rgba(59,201,232,0.04)",
              color: darkMode ? C.accent : C.muted,
              fontWeight: 600, fontSize: 13, cursor: "pointer",
              display: "flex", alignItems: "center", gap: 6,
              transition: "all 0.2s",
            }}
          >
            {darkMode ? "🌙 Dark Theme" : "☀️ Light Theme"}
          </button>
        </div>

        {/* Theme preview badge */}
        <div style={{
          display: "inline-flex", alignItems: "center", gap: 8,
          padding: "6px 14px", borderRadius: 8, marginBottom: 20,
          background: darkMode ? "rgba(3,12,44,0.8)" : "rgba(248,253,255,0.9)",
          border: `1px solid ${darkMode ? "rgba(59,201,232,0.3)" : "#cbeef7"}`,
          fontSize: 12,
          color: darkMode ? "#7fb8cc" : "#666",
        }}>
          <span style={{ width: 10, height: 10, borderRadius: "50%", background: darkMode ? "#3BC9E8" : "#030c2c", display: "inline-block" }} />
          Report will download in <strong style={{ color: darkMode ? C.accent : C.bg, marginLeft: 4 }}>
            {darkMode ? "Dark" : "Light"} Theme
          </strong>
        </div>

        {/* Report type selector */}
        <div style={{ fontSize: 12, color: C.muted, marginBottom: 10, fontWeight: 600, letterSpacing: 1, textTransform: "uppercase" }}>Report Type</div>
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

        {/* Date range */}
        <div style={{ fontSize: 12, color: C.muted, marginBottom: 8, fontWeight: 600, letterSpacing: 1, textTransform: "uppercase" }}>Date Range</div>
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

        {/* No data notice */}
        {!latestResult && (
          <div style={{ background: "rgba(255,209,102,0.08)", border: `1px solid ${C.warn}33`, borderRadius: 10, padding: "12px 16px", marginBottom: 18, fontSize: 13, color: C.warn }}>
            ⚡ Load data from a source tab first (CSV, Google Fit, or Apple Health) to enable report generation.
          </div>
        )}

        {/* Action buttons */}
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <button
            onClick={handleDownload}
            disabled={!latestResult || generating}
            style={{
              padding: "13px 32px", borderRadius: 12, border: "none",
              background: !latestResult
                ? "rgba(59,201,232,0.15)"
                : darkMode
                  ? "linear-gradient(135deg, #3BC9E8, #0099bb)"
                  : "linear-gradient(135deg, #3BC9E8, #0099bb)",
              color: !latestResult ? C.muted : "#030c2c",
              fontWeight: 700, fontSize: 15, cursor: !latestResult ? "not-allowed" : "pointer",
              display: "flex", alignItems: "center", gap: 8,
              opacity: generating ? 0.7 : 1,
            }}
          >
            {generating ? "⏳ Preparing..." : `⬇️ Download ${darkMode ? "🌙" : "☀️"} Report`}
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
          📌 Opens as an HTML file. To save as PDF: open the file → press <strong style={{ color: C.text }}>Ctrl+P</strong> (or Cmd+P) → choose <strong style={{ color: C.text }}>Save as PDF</strong>. All colours — including dark backgrounds — will print correctly.
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
            background: darkMode ? "#030c2c" : "#fff",
            borderRadius: 16, overflow: "hidden",
            display: "flex", flexDirection: "column",
            maxHeight: "90vh",
          }}>
            <div style={{
              background: C.card, padding: "14px 20px",
              display: "flex", justifyContent: "space-between", alignItems: "center",
              borderBottom: `1px solid ${C.border}`,
            }}>
              <div style={{ color: C.accent, fontWeight: 700, fontSize: 14 }}>
                📄 Preview — {reportType} {darkMode ? "🌙 Dark" : "☀️ Light"}
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
              style={{ flex: 1, border: "none", background: darkMode ? "#030c2c" : "#fff" }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
//  MAIN PAGE  — unchanged
// ═══════════════════════════════════════════════════════════════════
export default function SmartWatchPage() {
  const [tab, setTab]             = useState("csv");
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState("");
  const [result, setResult]       = useState(null);
  const [fitStatus, setFitStatus] = useState(null);
  const [fitToken, setFitToken]   = useState(() => {
    try { return JSON.parse(localStorage.getItem("google_fit_token")); } catch { return null; }
  });
  const [days, setDays] = useState(30);
  const fileRef = useRef();

  const [lastResult, setLastResult] = useState(null);

  function setResultAndCache(r) {
    setResult(r);
    if (r) setLastResult(r);
  }

  useEffect(() => {
    smartwatchAPI.googleFitStatus()
      .then(r => setFitStatus(r.data))
      .catch(() => setFitStatus({ configured: false }));
  }, []);

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
    setLoading(true); setError(""); setResult(null);
    try { const res = await smartwatchAPI.uploadCSV(file); setResultAndCache(res.data); }
    catch (err) { setError(err.response?.data?.detail || "Failed to parse CSV"); }
    setLoading(false);
  }

  async function connectGoogleFit() {
    setLoading(true); setError("");
    try { const res = await smartwatchAPI.googleFitAuthUrl(); window.location.href = res.data.auth_url; }
    catch (e) { setError(e.response?.data?.detail || "Could not get auth URL"); setLoading(false); }
  }

  async function fetchGoogleFitData() {
    if (!fitToken) return;
    setLoading(true); setError(""); setResult(null);
    try {
      const res = await smartwatchAPI.googleFitData(fitToken, days);
      setResultAndCache(res.data);
      if (res.data.token) {
        localStorage.setItem("google_fit_token", JSON.stringify(res.data.token));
        setFitToken(res.data.token);
      }
    } catch (e) { setError(e.response?.data?.detail || "Failed to fetch data"); }
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
      <p style={{ color: C.muted, fontSize: 14, marginBottom: 24 }}>
        Upload CSV from your smartwatch or connect Google Fit / Apple Health for automatic sync.
      </p>

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
          <div onClick={() => fileRef.current.click()} style={{
            border: `2px dashed ${C.border}`, borderRadius: 14, padding: "48px 20px",
            textAlign: "center", cursor: "pointer", marginBottom: 20, background: "rgba(59,201,232,0.03)",
          }}>
            <input ref={fileRef} type="file" accept=".csv" onChange={handleCSV} style={{ display: "none" }} />
            <div style={{ fontSize: 48, marginBottom: 12 }}>⌚</div>
            <div style={{ color: C.text, fontWeight: 600, fontSize: 16, marginBottom: 6 }}>Click to upload smartwatch CSV</div>
            <div style={{ color: C.muted, fontSize: 13 }}>Supports Apple Watch, Samsung, Fitbit, Garmin, Google Fit exports</div>
          </div>
          {loading && <div style={{ color: C.accent, textAlign: "center", padding: 20 }}>📊 Parsing your health data...</div>}
          {error   && <div style={{ color: C.danger, padding: 16, background: "rgba(255,77,109,0.1)", borderRadius: 10, marginBottom: 16 }}>⚠️ {error}</div>}
          {result  && (
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
              <button onClick={connectGoogleFit} disabled={loading} style={{ padding: "14px 40px", borderRadius: 12, border: "none", background: loading ? "rgba(59,201,232,0.3)" : C.accent, color: C.bg, fontWeight: 700, fontSize: 16, cursor: loading ? "not-allowed" : "pointer" }}>
                {loading ? "Connecting..." : "🔗 Connect Google Fit"}
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
                    {loading ? "Fetching..." : "🔄 Refresh Data"}
                  </button>
                  <button onClick={disconnectGoogleFit} style={{ padding: "7px 18px", borderRadius: 8, border: `1px solid ${C.danger}44`, background: "none", color: C.danger, fontSize: 13, cursor: "pointer" }}>Disconnect</button>
                </div>
              </div>
              {loading && <div style={{ color: C.accent, textAlign: "center", padding: 20 }}>📡 Fetching from Google Fit...</div>}
              {error   && <div style={{ color: C.danger, padding: 16, background: "rgba(255,77,109,0.1)", borderRadius: 10, marginBottom: 16 }}>⚠️ {error}</div>}
              {!result && !loading && (
                <div style={{ textAlign: "center", padding: 40 }}>
                  <button onClick={fetchGoogleFitData} style={{ padding: "14px 40px", borderRadius: 12, border: "none", background: C.accent, color: C.bg, fontWeight: 700, fontSize: 16, cursor: "pointer" }}>
                    📡 Load Google Fit Data
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
      {tab === "reports" && <ReportsTab latestResult={lastResult} />}
    </div>
  );
}
