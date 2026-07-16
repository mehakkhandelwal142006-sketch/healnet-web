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
// for its size. Gemma-2-2B is a lighter fallback.
//
// Each model has an f16 variant (faster, smaller download) and an f32
// variant (works on GPUs that don't support the WebGPU "shader-f16"
// feature — many integrated/mobile GPUs don't). We detect support at
// runtime and pick automatically so the user never has to know this
// distinction, or hit a cryptic "Invalid ShaderModule" error.
export const MODELS = {
  "phi-3.5": {
    f16: "Phi-3.5-mini-instruct-q4f16_1-MLC",
    f32: "Phi-3.5-mini-instruct-q4f32_1-MLC",
    label: "Phi-3.5 Mini (best quality, ~2.5GB)",
  },
  "gemma-2-2b": {
    f16: "gemma-2-2b-it-q4f16_1-MLC",
    f32: "gemma-2-2b-it-q4f32_1-MLC",
    label: "Gemma 2 2B (lighter, ~1.6GB)",
  },
};

let enginePromise = null;
let currentModelKey = null;
let f16SupportPromise = null;

/** True if this browser can run WebLLM at all. */
export function isWebGPUAvailable() {
  return typeof navigator !== "undefined" && !!navigator.gpu;
}

/**
 * True if the GPU/browser supports the WebGPU "shader-f16" feature.
 * Cached after first check. Falls back to false (safer, f32) on any error.
 */
export async function supportsShaderF16() {
  if (f16SupportPromise) return f16SupportPromise;
  f16SupportPromise = (async () => {
    try {
      if (!navigator.gpu) return false;
      const adapter = await navigator.gpu.requestAdapter();
      return !!adapter?.features?.has("shader-f16");
    } catch {
      return false;
    }
  })();
  return f16SupportPromise;
}

/** Resolve which actual model id will be used for a given model key, and whether it's the fast (f16) or compatibility (f32) variant. */
export async function resolveModelVariant(modelKey = "phi-3.5") {
  const entry = MODELS[modelKey] ?? MODELS["phi-3.5"];
  const hasF16 = await supportsShaderF16();
  return { modelId: hasF16 ? entry.f16 : entry.f32, usesF16: hasF16 };
}

/**
 * Load (or reuse) the engine for a given model.
 * @param {string} modelKey - key into MODELS, e.g. "phi-3.5"
 * @param {(report: {progress:number, text:string}) => void} onProgress
 */
export async function getEngine(modelKey = "phi-3.5", onProgress) {
  if (enginePromise && currentModelKey === modelKey) return enginePromise;

  if (!isWebGPUAvailable()) {
    return Promise.reject(
      new Error(
        "This browser doesn't support WebGPU, which is required for on-device AI. Try the latest Chrome or Edge."
      )
    );
  }

  currentModelKey = modelKey;
  const { modelId, usesF16 } = await resolveModelVariant(modelKey);

  const createPromise = CreateMLCEngine(modelId, {
    initProgressCallback: (report) => {
      const prefix = usesF16 ? "" : "[Compatibility mode] ";
      onProgress?.({ progress: report.progress ?? 0, text: prefix + (report.text ?? "") });
    },
  });

  enginePromise = createPromise;

  // If engine creation itself fails, clear the cache so the next attempt
  // starts fresh instead of retrying against a broken promise.
  createPromise.catch(() => {
    if (enginePromise === createPromise) {
      enginePromise = null;
      currentModelKey = null;
    }
  });

  return enginePromise;
}

/** Force-clear the cached engine (e.g. after a runtime error like "Object has already been disposed"), without trying to call .unload() on a possibly-broken instance. */
export function resetEngine() {
  enginePromise = null;
  currentModelKey = null;
}

/**
 * Stream a chat completion. Calls onToken for every partial chunk and
 * resolves with the full text at the end.
 */
export async function streamChat({ modelKey, messages, onToken, onProgress, temperature = 0.4 }) {
  const engine = await getEngine(modelKey, onProgress);

  try {
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
  } catch (e) {
    // Runtime errors (e.g. "Object has already been disposed") mean the
    // cached engine instance is broken — clear it so the next attempt
    // creates a fresh one instead of repeatedly hitting the same error.
    resetEngine();
    throw e;
  }
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
