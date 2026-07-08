import { useEffect, useState } from "react";
import { smartAlertsAPI } from "../services/api";

const C = {
  bg: "#030c2c", card: "#04163c", border: "rgba(59,201,232,0.18)",
  accent: "#3BC9E8", accent2: "#00f5a0", danger: "#ff4d6d",
  warn: "#ffd166", text: "#e8f4f8", muted: "rgba(232,244,248,0.5)",
};

const SEVERITY = {
  high:     { color: C.danger, icon: "🔴", label: "High" },
  moderate: { color: C.warn,   icon: "🟠", label: "Moderate" },
  mild:     { color: C.accent, icon: "🔵", label: "Mild" },
};

/**
 * SmartAlertBanner
 * Drop into the per-patient page. Shows nothing if there are no
 * active deterioration trends for this patient.
 *
 * Usage: <SmartAlertBanner patientId={selPatient.patient_id} />
 */
export default function SmartAlertBanner({ patientId }) {
  const [alerts, setAlerts]     = useState([]);
  const [dismissed, setDismissed] = useState(false);
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    if (!patientId) return;
    let cancelled = false;
    setLoading(true);
    setDismissed(false);

    smartAlertsAPI.getForPatient(patientId)
      .then(res => { if (!cancelled) setAlerts(res.data?.alerts || []); })
      .catch(() => { if (!cancelled) setAlerts([]); })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [patientId]);

  if (loading || dismissed || alerts.length === 0) return null;

  const top = alerts[0]; // backend already sorts worst-first
  const sev = SEVERITY[top.severity] || SEVERITY.mild;
  const extraCount = alerts.length - 1;

  return (
    <div style={{
      display: "flex", alignItems: "flex-start", gap: 12,
      padding: "14px 18px", borderRadius: 12,
      background: `${sev.color}0d`,
      border: `1px solid ${sev.color}44`,
      borderLeft: `4px solid ${sev.color}`,
      marginBottom: 20,
    }}>
      <div style={{ fontSize: 20, lineHeight: 1 }}>{sev.icon}</div>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 700, color: sev.color, marginBottom: 2, fontSize: 14 }}>
          Health Trend Alert
        </div>
        <div style={{ color: C.text, fontSize: 13, lineHeight: 1.5 }}>
          {top.message}
          {extraCount > 0 && (
            <span style={{ color: C.muted }}> — {extraCount} more metric{extraCount > 1 ? "s" : ""} also trending.</span>
          )}
        </div>
      </div>
      <button
        onClick={() => setDismissed(true)}
        aria-label="Dismiss"
        style={{
          background: "none", border: "none", cursor: "pointer",
          color: C.muted, fontSize: 15, lineHeight: 1, padding: 4,
        }}
      >
        ✕
      </button>
    </div>
  );
}
