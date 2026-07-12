/**
 * offlineStore.js
 * ───────────────────────────────────────────────────────────────────
 * Central offline data layer for HealNet AI.
 *
 * Keys used in localStorage:
 *   healnet_vitals_cache        → { [patientId]: { data, savedAt } }
 *   healnet_pending_vitals      → Array<{ id, patientId, payload, queuedAt }>
 *   healnet_wearable_cache      → { summary, data, source, total_records, savedAt }
 *   healnet_patients_cache      → { patients: [], savedAt }
 *   healnet_ai_cache            → { [patientId]: { result, savedAt } }
 *
 * Nothing here touches the network — it is purely read/write to
 * localStorage so every function is synchronous and safe to call
 * anywhere, including inside useEffect clean-up.
 * ───────────────────────────────────────────────────────────────────
 */

// ── helpers ──────────────────────────────────────────────────────
function read(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function remove(key) {
  try { localStorage.removeItem(key); } catch { /* noop */ }
}

// ── Patients cache ────────────────────────────────────────────────
export function cachePatients(patients) {
  write("healnet_patients_cache", { patients, savedAt: Date.now() });
}

export function getCachedPatients() {
  const stored = read("healnet_patients_cache");
  return stored?.patients ?? [];
}

// ── Vitals cache (per patient) ────────────────────────────────────
export function cacheVitals(patientId, vitalsArray) {
  const all = read("healnet_vitals_cache") ?? {};
  all[patientId] = { data: vitalsArray, savedAt: Date.now() };
  write("healnet_vitals_cache", all);
}

export function getCachedVitals(patientId) {
  const all = read("healnet_vitals_cache") ?? {};
  return all[patientId] ?? null;
}

export function getCachedVitalsSummary(patientId) {
  const entry = getCachedVitals(patientId);
  if (!entry || !entry.data?.length) return null;
  const sorted = [...entry.data].sort(
    (a, b) => new Date(b.recorded_at) - new Date(a.recorded_at)
  );
  return {
    latest: sorted[0],
    count: sorted.length,
    savedAt: entry.savedAt,
  };
}

// ── Pending vitals queue ──────────────────────────────────────────
export function enqueuePendingVital(patientId, payload) {
  const queue = read("healnet_pending_vitals") ?? [];
  const entry = {
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    patientId,
    payload,
    queuedAt: Date.now(),
  };
  queue.push(entry);
  write("healnet_pending_vitals", queue);
  return entry.id;
}

export function getPendingVitals() {
  return read("healnet_pending_vitals") ?? [];
}

export function removePendingVital(id) {
  const queue = getPendingVitals().filter((e) => e.id !== id);
  write("healnet_pending_vitals", queue);
}

export function clearPendingVitals() {
  remove("healnet_pending_vitals");
}

export function pendingCount() {
  return getPendingVitals().length;
}

// ── Wearable data cache (SmartWatch page) ─────────────────────────
export function cacheWearableResult(result) {
  if (!result) return;
  write("healnet_wearable_cache", { ...result, savedAt: Date.now() });
}

export function getCachedWearableResult() {
  return read("healnet_wearable_cache");
}

// ── AI result cache (AIPanel) ─────────────────────────────────────
export function cacheAIResult(patientId, result) {
  const all = read("healnet_ai_cache") ?? {};
  all[patientId] = { result, savedAt: Date.now() };
  write("healnet_ai_cache", all);
}

export function getCachedAIResult(patientId) {
  const all = read("healnet_ai_cache") ?? {};
  return all[patientId] ?? null; // { result, savedAt } | null
}

// ── Offline-aware alert evaluator ─────────────────────────────────
export function evaluateOfflineAlerts(summary) {
  if (!summary) return [];
  const alerts = [];
  const { avg_heart_rate: hr, avg_spo2: spo, avg_systolic_bp: sys } = summary;

  if (hr != null) {
    if (hr > 120 || hr < 40)
      alerts.push({ vital: "heart_rate", value: hr, level: "danger",
        message: `Avg heart rate ${hr} bpm is critically abnormal.` });
    else if (hr > 100 || hr < 55)
      alerts.push({ vital: "heart_rate", value: hr, level: "warning",
        message: `Avg heart rate ${hr} bpm needs attention.` });
  }
  if (spo != null) {
    if (spo < 90)
      alerts.push({ vital: "spo2", value: spo, level: "danger",
        message: `Avg SpO2 ${spo}% is dangerously low.` });
    else if (spo < 95)
      alerts.push({ vital: "spo2", value: spo, level: "warning",
        message: `Avg SpO2 ${spo}% is below normal.` });
  }
  if (sys != null) {
    if (sys > 180 || sys < 80)
      alerts.push({ vital: "systolic_bp", value: sys, level: "danger",
        message: `Avg BP ${sys} mmHg is critically abnormal.` });
    else if (sys > 140 || sys < 90)
      alerts.push({ vital: "systolic_bp", value: sys, level: "warning",
        message: `Avg BP ${sys} mmHg needs attention.` });
  }
  return alerts;
}

// ── Generic key-value cache (catch-all for any component) ────────
export function cacheGeneric(key, data) {
  write(`healnet_generic_${key}`, { data, savedAt: Date.now() });
}

export function getCachedGeneric(key) {
  const stored = read(`healnet_generic_${key}`);
  return stored ?? null; // { data, savedAt } | null
}

export function clearCachedGeneric(key) {
  remove(`healnet_generic_${key}`);
}

// ── Utility: human-readable age of a timestamp ───────────────────
export function timeAgo(ts) {
  if (!ts) return "never";
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}