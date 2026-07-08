import { useEffect, useState } from "react";
import { smartAlertsAPI } from "../services/api";

const C = {
  bg: "#030c2c", card: "#04163c", border: "rgba(59,201,232,0.18)",
  accent: "#3BC9E8", accent2: "#00f5a0", danger: "#ff4d6d",
  warn: "#ffd166", text: "#e8f4f8", muted: "rgba(232,244,248,0.5)",
};

const SEVERITY_RANK = { high: 0, moderate: 1, mild: 2 };
const SEVERITY = {
  high:     { color: C.danger, icon: "🔴" },
  moderate: { color: C.warn,   icon: "🟠" },
  mild:     { color: C.accent, icon: "🔵" },
};

/**
 * SmartAlertsOverviewBanner
 * Checks every patient's Smart Alerts (client-side, one call per patient)
 * and surfaces who has a deterioration trend right on the Overview page.
 * No backend changes needed — reuses the existing per-patient endpoint.
 *
 * Usage:
 *   <SmartAlertsOverviewBanner patients={patients} onView={openPatient} enabled={network.isOnline} />
 */
export default function SmartAlertsOverviewBanner({ patients, onView, enabled = true }) {
  const [flagged, setFlagged]   = useState([]);
  const [loading, setLoading]   = useState(true);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!enabled || !patients || patients.length === 0) { setLoading(false); return; }
    let cancelled = false;
    setLoading(true);

    Promise.allSettled(
      patients.map(p =>
        smartAlertsAPI.getForPatient(p.patient_id).then(res => ({ patient: p, alerts: res.data?.alerts || [] }))
      )
    ).then(results => {
      if (cancelled) return;
      const withAlerts = results
        .filter(r => r.status === "fulfilled" && r.value.alerts.length > 0)
        .map(r => r.value)
        .sort((a, b) => SEVERITY_RANK[a.alerts[0].severity] - SEVERITY_RANK[b.alerts[0].severity]);
      setFlagged(withAlerts);
      setLoading(false);
    });

    return () => { cancelled = true; };
  }, [patients, enabled]);

  if (!enabled || loading || dismissed || flagged.length === 0) return null;

  const shown = flagged.slice(0, 3);
  const moreCount = flagged.length - shown.length;

  return (
    <div style={{
      background: `${C.danger}0a`,
      border: `1px solid ${C.danger}33`,
      borderLeft: `4px solid ${C.danger}`,
      borderRadius: 16, padding: "18px 22px", marginBottom: 24,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
        <div>
          <div style={{ fontWeight: 700, color: C.danger, fontSize: 15, marginBottom: 2 }}>
            🚨 {flagged.length} patient{flagged.length > 1 ? "s" : ""} showing declining trends
          </div>
          <div style={{ color: C.muted, fontSize: 12 }}>
            Based on multi-day trend analysis of heart rate, stress, sleep, and activity.
          </div>
        </div>
        <button
          onClick={() => setDismissed(true)}
          aria-label="Dismiss"
          style={{ background: "none", border: "none", cursor: "pointer", color: C.muted, fontSize: 15, padding: 4 }}
        >
          ✕
        </button>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {shown.map(({ patient, alerts }) => {
          const top = alerts[0];
          const sev = SEVERITY[top.severity] || SEVERITY.mild;
          return (
            <div
              key={patient.patient_id}
              onClick={() => onView && onView(patient)}
              style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                background: "rgba(3,12,44,0.4)", borderRadius: 10, padding: "10px 14px",
                cursor: onView ? "pointer" : "default",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 16 }}>{sev.icon}</span>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13, color: C.text }}>{patient.name}</div>
                  <div style={{ fontSize: 12, color: C.muted }}>
                    {top.label} — {top.streak_days} days trending
                    {alerts.length > 1 && ` (+${alerts.length - 1} more)`}
                  </div>
                </div>
              </div>
              {onView && <div style={{ color: C.accent, fontSize: 12, whiteSpace: "nowrap" }}>View →</div>}
            </div>
          );
        })}
      </div>

      {moreCount > 0 && (
        <div style={{ marginTop: 10, fontSize: 12, color: C.muted }}>
          +{moreCount} more patient{moreCount > 1 ? "s" : ""} also flagged.
        </div>
      )}
    </div>
  );
}
