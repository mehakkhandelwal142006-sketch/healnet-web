/**
 * vectorStore.js
 * ───────────────────────────────────────────────────────────────────
 * Fully local retrieval (RAG) layer for the AI Copilot.
 *
 * Uses @xenova/transformers to run a tiny embedding model
 * (all-MiniLM-L6-v2, quantized, ~25MB) entirely in-browser via WASM.
 * Documents (vitals, alerts, symptoms, meds, health-score entries)
 * are embedded once per session and kept in memory; queries are
 * matched against them with cosine similarity. No server, no API.
 *
 * IMPORTANT: @xenova/transformers is loaded via a DYNAMIC import()
 * inside getExtractor(), not a static top-level import. A static
 * import would force this multi-MB library to be parsed and executed
 * the instant the Copilot page renders — even before the user clicks
 * anything — which is enough to crash the tab outright on
 * memory-constrained phones. Dynamic import defers fetching/parsing
 * this code until it's actually needed.
 * ───────────────────────────────────────────────────────────────────
 */

import { importWithChunkRecovery } from "./chunkRecovery";

const EMBED_MODEL = "Xenova/all-MiniLM-L6-v2";

let extractorPromise = null;
function getExtractor(onProgress) {
  if (!extractorPromise) {
    extractorPromise = (async () => {
      const { pipeline, env } = await importWithChunkRecovery(() => import("@xenova/transformers"));
      // Always fetch models from the HF CDN rather than expecting local files.
      env.allowLocalModels = false;
      return pipeline("feature-extraction", EMBED_MODEL, {
        progress_callback: (p) => onProgress?.(p),
      });
    })();
  }
  return extractorPromise;
}

function cosineSim(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) + 1e-8);
}

/**
 * Embed an array of text documents.
 * @returns {Promise<{text:string, meta:object, vector:number[]}[]>}
 */
export async function embedDocuments(docs, onProgress) {
  const extractor = await getExtractor(onProgress);
  const out = [];
  for (const doc of docs) {
    const res = await extractor(doc.text, { pooling: "mean", normalize: true });
    out.push({ text: doc.text, meta: doc.meta, vector: Array.from(res.data) });
  }
  return out;
}

/** Embed a single query string. */
export async function embedQuery(text) {
  const extractor = await getExtractor();
  const res = await extractor(text, { pooling: "mean", normalize: true });
  return Array.from(res.data);
}

/**
 * Return the top-k most relevant documents for a query.
 * @param {number[]} queryVector
 * @param {{text:string, meta:object, vector:number[]}[]} indexedDocs
 */
export function topK(queryVector, indexedDocs, k = 8) {
  return indexedDocs
    .map((d) => ({ ...d, score: cosineSim(queryVector, d.vector) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}
