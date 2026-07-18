/**
 * healthContextBuilder.js
 * ───────────────────────────────────────────────────────────────────
 * Pulls a patient's existing data (vitals, alerts, symptoms,
 * medications, health-score history) through the normal HealNet API
 * — same calls the rest of the app already makes — and turns each
 * record into a short natural-language "document" that can be
 * embedded and retrieved by the local vector store.
 *
 * This runs online (fetching from Supabase via FastAPI) but ALL of
 * the AI reasoning over that data happens fully offline afterwards.
 * If the network is unavailable, it falls back to whatever is
 * already cached by the existing offline layer (offlineStore.js).
 * ───────────────────────────────────────────────────────────────────
 */

import {
  vitalsAPI, alertsAPI, symptomsAPI, medicationsAPI, healthScoreAPI,
} from "../services/api";
import { getCachedVitals } from "../offline/offlineStore";

function fmtDate(iso) {
  if (!iso) return "unknown date";
  try { return new Date(iso).toLocaleString(); } catch { return iso; }
}

/**
 * Normalize an API response payload into a plain array, regardless of
 * which shape that particular endpoint happens to wrap its list in.
 * Different HealNet endpoints (or different versions of the same
 * endpoint) have returned: a bare array, `{ items: [...] }`,
 * `{ results: [...] }`, `{ data: [...] }`, or a single record object
 * instead of a list. Without this, `.forEach`/`.map` on the raw value
 * throws "is not a function" the moment one endpoint's shape doesn't
 * match what the code assumed (this is what was crashing indexing).
 */
function toArray(value) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object") return [];
  if (Array.isArray(value.items)) return value.items;
  if (Array.isArray(value.results)) return value.results;
  if (Array.isArray(value.data)) return value.data;
  if (Array.isArray(value.records)) return value.records;
  // A single record object (not a list) — treat it as a one-item list
  // rather than silently dropping it.
  return [value];
}

function vitalToText(v) {
  const parts = [];
  if (v.heart_rate)       parts.push(`heart rate ${v.heart_rate} bpm`);
  if (v.spo2)              parts.push(`SpO2 ${v.spo2}%`);
  if (v.systolic_bp && v.diastolic_bp)
    parts.push(`blood pressure ${v.systolic_bp}/${v.diastolic_bp} mmHg`);
  if (v.temperature)       parts.push(`temperature ${v.temperature}°C`);
  if (v.blood_sugar)       parts.push(`blood sugar ${v.blood_sugar} mg/dL`);
  if (v.respiratory_rate)  parts.push(`respiratory rate ${v.respiratory_rate} br/min`);
  if (v.bmi)                parts.push(`BMI ${v.bmi}`);
  if (!parts.length) return null;
  return `Vitals reading on ${fmtDate(v.recorded_at)} (source: ${v.source || "manual"}): ${parts.join(", ")}.`;
}

function alertToText(a) {
  return `Alert on ${fmtDate(a.created_at || a.triggered_at)}: ${a.message || a.title || "unspecified alert"} (severity: ${a.severity || "unknown"}, acknowledged: ${a.acknowledged ? "yes" : "no"}).`;
}

function symptomToText(s) {
  return `Symptom logged on ${fmtDate(s.recorded_at || s.created_at)}: ${s.description || s.name || "unspecified symptom"}${s.severity ? `, severity ${s.severity}` : ""}.`;
}

function medicationToText(m) {
  return `Medication on ${fmtDate(m.recorded_at || m.created_at)}: ${m.name || "unspecified medication"}${m.dosage ? `, dosage ${m.dosage}` : ""}${m.taken === false ? " (missed dose)" : ""}.`;
}

function scoreToText(h) {
  return `Health score on ${fmtDate(h.date || h.recorded_at)}: ${h.score ?? h.health_score}/100.`;
}

/**
 * Build a list of {text, meta} documents for one patient, ready to
 * be passed into vectorStore.embedDocuments().
 */
export async function buildPatientDocuments(patientId) {
  const docs = [];

  const [vRes, aRes, sRes, mRes, hRes] = await Promise.allSettled([
    vitalsAPI.getForPatient(patientId, 100),
    alertsAPI.getForPatient(patientId),
    symptomsAPI.getForPatient(patientId, 50),
    medicationsAPI.getForPatient(patientId, 50),
    healthScoreAPI.getHistory(patientId, 60),
  ]);

  const vitals = vRes.status === "fulfilled"
    ? toArray(vRes.value?.data)
    : toArray(getCachedVitals(patientId));
  vitals.forEach((v) => {
    const text = vitalToText(v);
    if (text) docs.push({ text, meta: { type: "vital", recorded_at: v.recorded_at } });
  });

  if (aRes.status === "fulfilled") {
    toArray(aRes.value?.data).forEach((a) =>
      docs.push({ text: alertToText(a), meta: { type: "alert" } })
    );
  }

  if (sRes.status === "fulfilled") {
    toArray(sRes.value?.data).forEach((s) =>
      docs.push({ text: symptomToText(s), meta: { type: "symptom" } })
    );
  }

  if (mRes.status === "fulfilled") {
    toArray(mRes.value?.data).forEach((m) =>
      docs.push({ text: medicationToText(m), meta: { type: "medication" } })
    );
  }

  if (hRes.status === "fulfilled") {
    toArray(hRes.value?.data).forEach((h) =>
      docs.push({ text: scoreToText(h), meta: { type: "health_score" } })
    );
  }

  // Surface which calls actually failed outright (network/4xx/5xx), so
  // it's distinguishable in logs from "this patient just has no data yet".
  [["vitals", vRes], ["alerts", aRes], ["symptoms", sRes], ["medications", mRes], ["health score", hRes]]
    .filter(([, r]) => r.status === "rejected")
    .forEach(([label, r]) => console.warn(`[Copilot] Failed to fetch ${label}:`, r.reason));

  return docs;
}

/** Quick plain-text summary (no LLM) used as a fallback / header context. */
export function summarizeDocumentCounts(docs) {
  const counts = docs.reduce((acc, d) => {
    acc[d.meta.type] = (acc[d.meta.type] || 0) + 1;
    return acc;
  }, {});
  return Object.entries(counts)
    .map(([type, n]) => `${n} ${type.replace("_", " ")} record${n === 1 ? "" : "s"}`)
    .join(", ");
}
