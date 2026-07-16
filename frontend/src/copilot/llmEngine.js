/**
 * llmEngine.js
 * ───────────────────────────────────────────────────────────────────
 * On-device LLM engine using WebLLM (@mlc-ai/web-llm).
 * The model runs entirely inside the browser via WebGPU — nothing is
 * ever sent to a server, and no API key is required.
 *
 * The model file (~1-2 GB) is downloaded once from the WebLLM CDN and
 * cached by the browser (Cache Storage API), so subsequent loads are
 * near-instant and work fully offline.
 * ───────────────────────────────────────────────────────────────────
 */

import { CreateMLCEngine } from "@mlc-ai/web-llm";

// Small, fast, good-quality instruction models that run well on a
// mid-range laptop/phone GPU. Phi-3.5 is the default: strong reasoning
// for its size (~2.5GB in 4-bit). Gemma-2-2B is a lighter fallback.
export const MODELS = {
  "phi-3.5": {
    id: "Phi-3.5-mini-instruct-q4f16_1-MLC",
    label: "Phi-3.5 Mini (best quality, ~2.5GB)",
  },
  "gemma-2-2b": {
    id: "gemma-2-2b-it-q4f16_1-MLC",
    label: "Gemma 2 2B (lighter, ~1.6GB)",
  },
};

let enginePromise = null;
let currentModelKey = null;

/** True if this browser can run WebLLM at all. */
export function isWebGPUAvailable() {
  return typeof navigator !== "undefined" && !!navigator.gpu;
}

/**
 * Load (or reuse) the engine for a given model.
 * @param {string} modelKey - key into MODELS, e.g. "phi-3.5"
 * @param {(report: {progress:number, text:string}) => void} onProgress
 */
export function getEngine(modelKey = "phi-3.5", onProgress) {
  if (enginePromise && currentModelKey === modelKey) return enginePromise;

  if (!isWebGPUAvailable()) {
    return Promise.reject(
      new Error(
        "This browser doesn't support WebGPU, which is required for on-device AI. Try the latest Chrome or Edge."
      )
    );
  }

  currentModelKey = modelKey;
  const modelId = MODELS[modelKey]?.id ?? MODELS["phi-3.5"].id;

  enginePromise = CreateMLCEngine(modelId, {
    initProgressCallback: (report) => {
      onProgress?.({ progress: report.progress ?? 0, text: report.text ?? "" });
    },
  });

  return enginePromise;
}

/**
 * Stream a chat completion. Calls onToken for every partial chunk and
 * resolves with the full text at the end.
 */
export async function streamChat({ modelKey, messages, onToken, onProgress, temperature = 0.4 }) {
  const engine = await getEngine(modelKey, onProgress);

  const chunks = await engine.chat.completions.create({
    messages,
    temperature,
    stream: true,
  });

  let full = "";
  for await (const chunk of chunks) {
    const delta = chunk.choices?.[0]?.delta?.content || "";
    if (delta) {
      full += delta;
      onToken?.(delta, full);
    }
  }
  return full;
}

/** Unload the model to free GPU/RAM (e.g. when leaving the Copilot page). */
export async function unloadEngine() {
  if (enginePromise) {
    try {
      const engine = await enginePromise;
      await engine.unload();
    } catch {
      /* noop */
    }
  }
  enginePromise = null;
  currentModelKey = null;
}
