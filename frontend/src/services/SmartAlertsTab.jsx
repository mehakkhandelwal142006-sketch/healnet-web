import { useEffect, useState } from "react";
import { smartAlertsAPI } from "../services/api";

const C = {
  bg: "#030c2c", card: "#04163c", border: "rgba(59,201,232,0.18)",
  accent: "#3BC9E8", accent2: "#00f5a0", danger: "#ff4d6d",
  warn: "#ffd166", text: "#e8f4f8", muted: "rgba(232,244,248,0.5)",
};

function Card({ children, style = {} }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 24, ...style }}>
      {children}
    </div>
  );
}

const SEVERITY = {
  high:     { color: C.danger, label: "High" },
  moderate: { color: C.warn,   label: "Moderate" },
  mild:     { color: C.accent, label: "Mild" },
};

function AlertCard({ alert }) {
  const sev = SEVERITY[alert.severity] || SEVERITY.mild;
  const isRising = alert.direction === "up";

  return (
    <div style={{
      border: `1px solid ${C.border}`,
      borderLeft: `4px solid ${sev.color}`,
      borderRadius: 12, padding: 18, marginBottom: 12,
      background: "rgba(59,201,232,0.03)",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <div style={{ fontWeight: 700, fontSize: 14, color: C.text }}>{alert.label}</div>
        <span style={{
          fontSize: 11, fontWeight: 700, color: sev.color,
          background: `${sev.color}22`, border: `1px solid ${sev.color}44`,
          padding: "3px 10px", borderRadius: 999,
        }}>
          {sev.label} · {alert.streak_days} days
        </span>
      </div>

      <div style={{ fontSize: 13, color: C.muted, marginBottom: 12, lineHeight: 1.5 }}>{alert.message}</div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
        {[
          ["BASELINE", `${alert.baseline_value} ${alert.unit}`, C.text],
          ["CURRENT",  `${alert.current_value} ${alert.unit}`,  sev.color],
          ["TREND",    `${isRising ? "↑" : "↓"} ${Math.abs(alert.change)} ${alert.unit}`, sev.color],
          ["SINCE",    alert.from_date, C.text],
        ].map(([label, val, color]) => (
          <div key={label} style={{ background: "rgba(59,201,232,0.05)", borderRadius: 8, padding: "8px 10px", textAlign: "center" }}>
            <div style={{ fontSize: 10, color: C.muted, letterSpacing: 0.5, marginBottom: 3 }}>{label}</div>
            <div style={{ fontSize: 13, fontWeight: 700, color }}>{val}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * SmartAlertsTab
 * Drop into HealthScorePage's tab system.
 * Usage: {view === "alerts" && <SmartAlertsTab patientId={patientId} />}
 */
export default function SmartAlertsTab({ patientId }) {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(false);

  useEffect(() => {
    if (!patientId) return;
    let cancelled = false;
    setLoading(true); setError(false);

    smartAlertsAPI.getForPatient(patientId)
      .then(res => { if (!cancelled) setData(res.data); })
      .catch(() => { if (!cancelled) setError(true); })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [patientId]);

  if (loading) {
    return <div style={{ color: C.muted, textAlign: "center", padding: 60 }}>Checking for health trends...</div>;
  }
  if (error) {
    return <div style={{ color: C.danger, textAlign: "center", padding: 60 }}>Couldn't load Smart Alerts right now.</div>;
  }

  const alerts = data?.alerts || [];

  if (!data?.has_data) {
    return (
      <Card>
        <div style={{ color: C.muted, textAlign: "center", padding: 20 }}>
          Not enough recorded data yet to detect trends. Alerts will appear here once vitals and
          wearable data accumulate over a few days.
        </div>
      </Card>
    );
  }

  if (alerts.length === 0) {
    return (
      <Card>
        <div style={{ color: C.accent2, textAlign: "center", padding: 20 }}>
          ✅ No deterioration trends detected. All monitored metrics look stable.
        </div>
      </Card>
    );
  }

  return (
    <Card style={{ padding: "8px 24px" }}>
      <div style={{ fontSize: 12, color: C.muted, fontWeight: 700, letterSpacing: 0.5, padding: "12px 0 8px" }}>
        {alerts.length} METRIC{alerts.length !== 1 ? "S" : ""} TRENDING IN THE WRONG DIRECTION
      </div>
      <div style={{ paddingTop: 4, paddingBottom: 8 }}>
        {alerts.map(a => <AlertCard key={a.metric} alert={a} />)}
      </div>
    </Card>
  );
}
