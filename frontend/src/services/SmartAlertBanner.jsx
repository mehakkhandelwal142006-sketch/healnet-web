import { useEffect, useState } from "react";
import { smartAlertsAPI } from "../api"; // adjust path to match your project structure

/**
 * SmartAlertBanner
 * ─────────────────────────────────────────────────────────────
 * Drop this into the Overview page. Shows nothing if there are
 * no active deterioration alerts. Shows a dismissible banner
 * (highest severity first) if there are.
 *
 * Usage:
 *   <SmartAlertBanner patientId={patient.patient_id} />
 */

const SEVERITY_STYLES = {
  high:     { bg: "#fef2f2", border: "#fca5a5", text: "#991b1b", icon: "🔴" },
  moderate: { bg: "#fffbeb", border: "#fcd34d", text: "#92400e", icon: "🟠" },
  mild:     { bg: "#eff6ff", border: "#93c5fd", text: "#1e40af", icon: "🔵" },
};

export default function SmartAlertBanner({ patientId }) {
  const [alerts, setAlerts] = useState([]);
  const [dismissed, setDismissed] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!patientId) return;
    let cancelled = false;

    smartAlertsAPI
      .getForPatient(patientId)
      .then((res) => {
        if (!cancelled) setAlerts(res.data?.alerts || []);
      })
      .catch(() => {
        if (!cancelled) setAlerts([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [patientId]);

  if (loading || dismissed || alerts.length === 0) return null;

  const top = alerts[0]; // already sorted worst-first by the backend
  const style = SEVERITY_STYLES[top.severity] || SEVERITY_STYLES.mild;
  const extraCount = alerts.length - 1;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 12,
        padding: "14px 16px",
        borderRadius: 10,
        border: `1px solid ${style.border}`,
        background: style.bg,
        marginBottom: 16,
      }}
    >
      <div style={{ fontSize: 20, lineHeight: 1 }}>{style.icon}</div>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 600, color: style.text, marginBottom: 2 }}>
          Health Trend Alert
        </div>
        <div style={{ color: style.text, fontSize: 14 }}>
          {top.message}
          {extraCount > 0 && (
            <span style={{ opacity: 0.8 }}> — {extraCount} more metric{extraCount > 1 ? "s" : ""} also trending.</span>
          )}
        </div>
      </div>
      <button
        onClick={() => setDismissed(true)}
        aria-label="Dismiss"
        style={{
          background: "none",
          border: "none",
          cursor: "pointer",
          color: style.text,
          fontSize: 16,
          lineHeight: 1,
          padding: 4,
        }}
      >
        ✕
      </button>
    </div>
  );
}
