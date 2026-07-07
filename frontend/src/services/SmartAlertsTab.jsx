import { useEffect, useState } from "react";
import { smartAlertsAPI } from "../api"; // adjust path to match your project structure

/**
 * SmartAlertsTab
 * ─────────────────────────────────────────────────────────────
 * Drop this in as a new tab on the Health Score page, alongside
 * your existing tabs (e.g. Overview / History / Explain).
 *
 * Usage:
 *   {activeTab === "alerts" && <SmartAlertsTab patientId={patient.patient_id} />}
 */

const SEVERITY_STYLES = {
  high:     { bar: "#ef4444", text: "#991b1b", label: "High" },
  moderate: { bar: "#f59e0b", text: "#92400e", label: "Moderate" },
  mild:     { bar: "#3b82f6", text: "#1e40af", label: "Mild" },
};

function AlertCard({ alert }) {
  const style = SEVERITY_STYLES[alert.severity] || SEVERITY_STYLES.mild;
  const isRising = alert.direction === "up";

  return (
    <div
      style={{
        border: "1px solid #e5e7eb",
        borderRadius: 12,
        padding: 16,
        marginBottom: 12,
        borderLeft: `4px solid ${style.bar}`,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontWeight: 600 }}>{alert.label}</div>
        <span
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: style.text,
            background: `${style.bar}22`,
            padding: "2px 8px",
            borderRadius: 999,
          }}
        >
          {style.label} · {alert.streak_days} days
        </span>
      </div>

      <div style={{ fontSize: 14, color: "#374151", margin: "8px 0" }}>{alert.message}</div>

      <div style={{ display: "flex", gap: 24, fontSize: 13, color: "#6b7280" }}>
        <div>
          <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5 }}>Baseline</div>
          <div style={{ fontWeight: 600, color: "#111827" }}>
            {alert.baseline_value} {alert.unit}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5 }}>Current</div>
          <div style={{ fontWeight: 600, color: style.text }}>
            {alert.current_value} {alert.unit}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5 }}>Trend</div>
          <div style={{ fontWeight: 600, color: style.text }}>
            {isRising ? "↑" : "↓"} {Math.abs(alert.change)} {alert.unit}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5 }}>Since</div>
          <div style={{ fontWeight: 600, color: "#111827" }}>
            {alert.from_date}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function SmartAlertsTab({ patientId }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!patientId) return;
    let cancelled = false;
    setLoading(true);

    smartAlertsAPI
      .getForPatient(patientId)
      .then((res) => {
        if (!cancelled) setData(res.data);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [patientId]);

  if (loading) {
    return <div style={{ padding: 24, color: "#6b7280" }}>Checking for health trends…</div>;
  }

  if (error) {
    return <div style={{ padding: 24, color: "#991b1b" }}>Couldn't load Smart Alerts right now.</div>;
  }

  const alerts = data?.alerts || [];

  if (!data?.has_data) {
    return (
      <div style={{ padding: 24, color: "#6b7280" }}>
        Not enough recorded data yet to detect trends. Alerts will appear here once vitals and wearable
        data accumulate over a few days.
      </div>
    );
  }

  if (alerts.length === 0) {
    return (
      <div style={{ padding: 24, color: "#166534" }}>
        ✅ No deterioration trends detected. All monitored metrics look stable.
      </div>
    );
  }

  return (
    <div style={{ padding: 16 }}>
      <div style={{ marginBottom: 16, fontSize: 14, color: "#6b7280" }}>
        {alerts.length} metric{alerts.length > 1 ? "s" : ""} trending in the wrong direction over the
        last few days.
      </div>
      {alerts.map((a) => (
        <AlertCard key={a.metric} alert={a} />
      ))}
    </div>
  );
}
