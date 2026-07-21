/**
 * chunkRecovery.js
 * ───────────────────────────────────────────────────────────────────
 * Dynamically-imported chunks (used for @mlc-ai/web-llm and
 * @xenova/transformers so they don't load until actually needed — see
 * llmEngine.js / vectorStore.js) reference specific, content-hashed
 * filenames baked in at the time the page was first loaded. If a new
 * deployment goes out while someone's tab is still open, those exact
 * filenames no longer exist on the server (Vercel serves the new
 * deployment's files instead), and the dynamic import() 404s with a
 * "ChunkLoadError: Loading chunk N failed" error.
 *
 * This isn't a code bug — it's an unavoidable tradeoff of code-
 * splitting. The standard fix is: detect this specific error and do a
 * one-time full page reload, which fetches the current deployment's
 * index.html and correctly-hashed chunk filenames. We guard with a
 * sessionStorage flag so a genuinely broken chunk doesn't cause an
 * infinite reload loop.
 */

const RELOAD_FLAG_KEY = "healnet_chunk_reload_attempted";

export function isChunkLoadError(e) {
  const msg = String(e?.message || e || "");
  return (
    e?.name === "ChunkLoadError" ||
    /Loading chunk [\w.-]+ failed/i.test(msg) ||
    /Failed to fetch dynamically imported module/i.test(msg)
  );
}

/**
 * Wrap a dynamic import() call. If it fails with a stale-chunk error,
 * reload the page once (fetching the current deployment) instead of
 * surfacing a confusing error. If it fails again after that (a real
 * problem, not staleness), let the error through normally.
 */
export async function importWithChunkRecovery(importFn) {
  try {
    const result = await importFn();
    sessionStorage.removeItem(RELOAD_FLAG_KEY); // this load succeeded — reset for the future
    return result;
  } catch (e) {
    if (isChunkLoadError(e) && !sessionStorage.getItem(RELOAD_FLAG_KEY)) {
      sessionStorage.setItem(RELOAD_FLAG_KEY, "1");
      window.location.reload();
      // Reload is async from the page's perspective — return a
      // never-resolving promise so calling code just shows a loading
      // state until the reload actually takes over.
      return new Promise(() => {});
    }
    throw e;
  }
}
