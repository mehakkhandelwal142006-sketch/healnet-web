// Lightweight local log of "report generated" events (AI Insights, Pupil
// scans, Smartwatch reports) per patient. There is no backend endpoint that
// persists these, so we keep a rolling local history and let TimelinePage
// read it back in as "report" events. Capped at 20 entries per patient.

const MAX_ENTRIES = 20;

function storageKey(patientId) {
  return `healnet_reports_${patientId}`;
}

export function logHealthReport(patientId, title, details = "") {
  if (!patientId) return;
  try {
    const key = storageKey(patientId);
    const existing = JSON.parse(localStorage.getItem(key) || "[]");
    const entry = {
      id: `report-${Date.now()}`,
      type: "report",
      occurred_at: new Date().toISOString(),
      title,
      details,
    };
    const updated = [entry, ...existing].slice(0, MAX_ENTRIES);
    localStorage.setItem(key, JSON.stringify(updated));
  } catch (e) {
    // localStorage can fail (private mode, quota) - never let this break the caller
    console.warn("Could not log health report locally:", e);
  }
}

export function getHealthReports(patientId) {
  if (!patientId) return [];
  try {
    return JSON.parse(localStorage.getItem(storageKey(patientId)) || "[]");
  } catch {
    return [];
  }
}
