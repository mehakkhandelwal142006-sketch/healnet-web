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
// for its size. Gemma-2-2B and SmolLM2-360M are progressively lighter
// fallbacks for constrained hardware.
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
  "smollm2-360m": {
    // ~376MB (f16) / ~580MB (f32) VRAM — for hardware too constrained
    // for even Gemma 2 2B. Much less capable, but a real last resort
    // rather than the Copilot simply not working at all.
    f16: "SmolLM2-360M-Instruct-q4f16_1-MLC",
    f32: "SmolLM2-360M-Instruct-q4f32_1-MLC",
    label: "SmolLM2 360M (minimal, ~0.6GB)",
  },
};

// Ordered from most to least capable. warmUpWithFallback() walks down
// this chain, starting from the requested model, trying each
// progressively lighter tier until one loads successfully or all are
// exhausted.
export const FALLBACK_CHAIN = ["phi-3.5", "gemma-2-2b", "smollm2-360m"];

let enginePromise = null;
let currentModelKey = null;
let f16SupportPromise = null;

/** True if this browser can run WebLLM at all. */
export function isWebGPUAvailable() {
  return typeof navigator !== "undefined" && !!navigator.gpu;
}

/**
 * Best-effort read of how constrained this device likely is, so we can
 * warn (or steer users to desktop) *before* attempting to load a
 * multi-GB model — rather than letting Android's low-memory killer
 * silently crash the whole tab ("Aw, Snap!") mid-load, which happens
 * too fast for any JS error handler to catch.
 *
 * navigator.deviceMemory (Chrome/Android only, rounded to
 * 0.25/0.5/1/2/4/8...) is our best signal but isn't available on
 * iOS/Safari/Firefox, so we combine it with a simple mobile UA check.
 * This is a heuristic, not a guarantee — always pair it with a way
 * for the user to proceed anyway.
 */
export function getDeviceProfile() {
  const ua = typeof navigator !== "undefined" ? navigator.userAgent || "" : "";
  const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(ua);
  const deviceMemoryGB = typeof navigator !== "undefined" ? navigator.deviceMemory : undefined;

  // On mobile, treat missing deviceMemory (common on iOS) or <=4GB as
  // likely insufficient for a 1.6-2.5GB model plus the embedding model
  // plus the app itself, all inside one Chrome tab's memory budget.
  // On desktop, only flag when deviceMemory is reported AND clearly low
  // (a lot of desktop Chrome installs simply don't expose this API, so
  // "undefined" shouldn't block desktop the way it does mobile).
  const likelyInsufficientMemory = isMobile
    ? (deviceMemoryGB === undefined || deviceMemoryGB <= 4)
    : (deviceMemoryGB !== undefined && deviceMemoryGB <= 2);

  return { isMobile, deviceMemoryGB, likelyInsufficientMemory };
}

/**
 * True if this error looks like a WebGPU "device lost" / disposed-object
 * error, as opposed to some other failure (network, parsing, etc).
 * These happen when the GPU runs out of memory, the OS/browser reclaims
 * the device mid-load, or the driver itself times out the GPU (Windows
 * TDR — "device hung"). They leave the previous engine instance
 * permanently unusable (any further call throws "Object has already
 * been disposed").
 */
export function isDeviceLostError(e) {
  const msg = String(e?.message || e || "").toLowerCase();
  return (
    msg.includes("device was lost") ||
    msg.includes("device has been lost") ||
    msg.includes("already been disposed") ||
    msg.includes("gpudevicelostinfo") ||
    msg.includes("out of memory") ||
    msg.includes("device_hung") ||
    msg.includes("device hung")
  );
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
 * IMPORTANT: this is intentionally a plain (non-async) function that
 * caches `enginePromise` synchronously before doing any awaiting. If
 * this were `async` and awaited before caching, two near-simultaneous
 * calls (e.g. a fast double-click) could both slip past the "already
 * loading" check and each try to create a competing engine — which is
 * exactly what causes GPU-level "Object has already been disposed"
 * errors, since two engines fight over the same WebGPU device.
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

  const createPromise = (async () => {
    const { modelId, usesF16 } = await resolveModelVariant(modelKey);
    return CreateMLCEngine(modelId, {
      initProgressCallback: (report) => {
        const prefix = usesF16 ? "" : "[Compatibility mode] ";
        onProgress?.({ progress: report.progress ?? 0, text: prefix + (report.text ?? "") });
      },
    });
  })();

  // Cache immediately (synchronously, in this same tick) so any other
  // call to getEngine() made before this resolves sees it right away.
  enginePromise = createPromise;

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

    if (isDeviceLostError(e)) {
      const friendly = new Error(
        "The GPU ran out of memory, the driver timed out, or the browser reclaimed it while running the model. Try a lighter model, close other GPU-heavy tabs, or restart the browser."
      );
      friendly.isDeviceLost = true;
      friendly.original = e;
      throw friendly;
    }
    throw e;
  }
}

/**
 * Warm up a model, cascading through progressively lighter tiers of
 * FALLBACK_CHAIN if the GPU device is lost (out-of-memory, driver
 * timeout, etc). Starts at `modelKey`'s position in the chain (so
 * picking a lighter model manually doesn't re-try heavier ones) and
 * walks downward until one loads successfully or every remaining tier
 * has been exhausted.
 *
 * @param {string} modelKey
 * @param {(report:{progress:number, text:string}) => void} onProgress
 * @returns {Promise<{usedModelKey: string, fellBack: boolean}>}
 */
export async function warmUpWithFallback(modelKey, onProgress) {
  const startIndex = Math.max(0, FALLBACK_CHAIN.indexOf(modelKey));
  const tiersToTry = FALLBACK_CHAIN.slice(startIndex);

  let lastError = null;

  for (let i = 0; i < tiersToTry.length; i++) {
    const tierKey = tiersToTry[i];
    const isFirstAttempt = i === 0;

    // Free any previously loaded engine's memory before each attempt —
    // on memory-constrained devices, holding two engines' worth of
    // weights in memory at once is often what tips it over into a
    // crash rather than a catchable "device lost" error.
    await unloadEngine();

    if (!isFirstAttempt) {
      onProgress?.({ progress: 0, text: `Switching to a lighter model (${MODELS[tierKey].label})...` });
    }

    try {
      await streamChat({
        modelKey: tierKey,
        messages: [{ role: "user", content: "hi" }],
        onToken: () => {},
        onProgress,
      });
      return { usedModelKey: tierKey, fellBack: !isFirstAttempt };
    } catch (e) {
      lastError = e;
      if (!isDeviceLostError(e)) throw e; // non-hardware error — don't cascade, surface immediately
      // otherwise: fall through and try the next lighter tier
    }
  }

  // Every tier in the chain failed with a device-lost-style error —
  // this points at the GPU driver/hardware itself, not model size.
  const allFailed = new Error(
    "Every available model — from the largest down to the smallest (~0.6GB) — failed to load the same way. This points to a GPU driver issue on this device rather than a model-size problem: check chrome://gpu for driver warnings, update your graphics driver, or try a different device/browser."
  );
  allFailed.allModelsFailed = true;
  allFailed.original = lastError;
  throw allFailed;
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
