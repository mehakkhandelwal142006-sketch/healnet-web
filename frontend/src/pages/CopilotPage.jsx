import { useState, useEffect, useRef, useCallback } from "react";
import { isWebGPUAvailable, warmUpWithFallback, streamChat, unloadEngine, MODELS, getDeviceProfile } from "../copilot/llmEngine";
import { embedDocuments, embedQuery, topK } from "../copilot/vectorStore";
import { buildPatientDocuments, summarizeDocumentCounts } from "../copilot/healthContextBuilder";
import { useNetwork } from "../offline/useNetwork";

const C = {
  bg: "#030c2c", card: "#04163c", border: "rgba(59,201,232,0.18)",
  accent: "#3BC9E8", accent2: "#00f5a0", danger: "#ff4d6d",
  warn: "#ffd166", text: "#e8f4f8", muted: "rgba(232,244,248,0.5)",
};

const selectStyle = {
  background: "#04163c", color: C.text, border: `1px solid ${C.border}`,
  borderRadius: 8, padding: "10px 12px", fontSize: 14, outline: "none",
};

const SYSTEM_PROMPT = `You are HealNet Copilot, an on-device health information assistant.
You are given retrieved excerpts from a patient's own recorded health data (vitals, alerts, symptoms, medications, health scores).
Rules:
- Base your answer ONLY on the provided context. If the context doesn't contain the answer, say so clearly.
- You are not a doctor. Never diagnose conditions or prescribe treatment. Frame observations as things to discuss with a clinician.
- Be concise, clear, and specific — cite actual numbers/dates from the context when relevant.
- If asked something unrelated to the patient's health data, politely redirect.`;

const QUICK_ACTIONS = [
  { id: "trends",  icon: "📈", label: "Explain Trends",     prompt: "Explain the recent trends in my vitals and health data. What's improving, what's worsening, and what should I keep an eye on?" },
  { id: "summary", icon: "📋", label: "Summarize Report",   prompt: "Give me a concise summary of my overall health data — key vitals, any alerts, symptoms, and medications." },
  { id: "recs",    icon: "💡", label: "Get Recommendations",prompt: "Based on my health data, what general lifestyle or monitoring recommendations would be reasonable? Remind me these aren't medical advice." },
];

export default function CopilotPage({ patients = [] }) {
  const { isOnline } = useNetwork();

  const [patientId, setPatientId] = useState(patients[0]?.patient_id || "");
  const deviceProfile = useState(() => getDeviceProfile())[0];
  const [modelKey, setModelKey]   = useState(deviceProfile.isMobile ? "gemma-2-2b" : "phi-3.5");
  const [proceedAnyway, setProceedAnyway] = useState(false);

  // Setup / indexing state
  const [stage, setStage]         = useState("idle"); // idle | loading-model | indexing | ready | error
  const [loadPct, setLoadPct]     = useState(0);
  const [loadText, setLoadText]   = useState("");
  const [docs, setDocs]           = useState([]);      // embedded documents
  const [docCounts, setDocCounts] = useState("");
  const [setupError, setSetupError] = useState("");
  const [driverIssue, setDriverIssue] = useState(false);
  const [fallbackNotice, setFallbackNotice] = useState("");

  // Chat state
  const [messages, setMessages]   = useState([]); // {role, content}
  const [input, setInput]         = useState("");
  const [streaming, setStreaming] = useState(false);
  const chatEndRef = useRef(null);
  const initializingRef = useRef(false);

  const gpuOk = isWebGPUAvailable();

  useEffect(() => {
    if (patients.length && !patientId) setPatientId(patients[0].patient_id);
  }, [patients, patientId]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streaming]);

  useEffect(() => () => { unloadEngine(); }, []); // unload model when leaving page


  const initialize = useCallback(async () => {
    if (!patientId || initializingRef.current) return;
    initializingRef.current = true;
    setSetupError(""); setDriverIssue(false); setFallbackNotice(""); setMessages([]); setDocs([]); setStage("loading-model");

    // Step 1: warm up the LLM (downloads/loads the model, cached after first time).
    // If the GPU device is lost while loading the selected model (usually
    // insufficient VRAM), automatically retry once with a lighter model.
    try {
      const { usedModelKey, fellBack } = await warmUpWithFallback(modelKey, (r) => {
        setLoadPct(Math.round((r.progress || 0) * 100));
        setLoadText(r.text || "Loading model...");
      });

      if (fellBack) {
        setModelKey(usedModelKey);
        setFallbackNotice(
          `⚠️ Your GPU didn't have enough memory for the selected model, so we automatically switched to ${MODELS[usedModelKey].label}.`
        );
      }
    } catch (e) {
      console.error("[Copilot] LLM warm-up failed:", e);
      setSetupError(`[Local LLM] ${e.message || "Failed to load the language model."}`);
      setDriverIssue(!!e.bothModelsFailed);
      setStage("error");
      initializingRef.current = false;
      return;
    }

    // Step 2: build + embed the patient's health documents
    setStage("indexing"); setLoadText("Fetching and indexing your health data...");
    try {
      const rawDocs = await buildPatientDocuments(patientId);
      if (!rawDocs.length) {
        setSetupError("No health data found yet for this patient — add some vitals first so the Copilot has something to work with.");
        setStage("idle");
        initializingRef.current = false;
        return;
      }
      const indexed = await embedDocuments(rawDocs, (p) => {
        if (p?.status === "progress") setLoadText(`Loading embedding model... ${Math.round(p.progress || 0)}%`);
      });
      setDocs(indexed);
      setDocCounts(summarizeDocumentCounts(rawDocs));
      setStage("ready");
      setMessages([{
        role: "assistant",
        content: `I've loaded and indexed your health data locally (${summarizeDocumentCounts(rawDocs)}). Everything from here runs entirely on this device — ask me anything, or use a quick action below.`,
      }]);
    } catch (e) {
      console.error("[Copilot] Embedding/indexing failed:", e);
      setSetupError(`[Embedding model] ${e.message || "Failed to index your health data."}`);
      setStage("error");
    } finally {
      initializingRef.current = false;
    }
  }, [patientId, modelKey]);
  async function ask(promptText) {
    if (!promptText.trim() || streaming || stage !== "ready") return;
    const userMsg = { role: "user", content: promptText };
    setMessages((m) => [...m, userMsg]);
    setInput("");
    setStreaming(true);

    try {
      // Retrieve relevant context locally
      const qVec = await embedQuery(promptText);
      const hits = topK(qVec, docs, 8);
      const context = hits.map((h) => `- ${h.text}`).join("\n");

      const chatMessages = [
        { role: "system", content: `${SYSTEM_PROMPT}\n\nRetrieved patient data:\n${context}` },
        ...messages.filter((m) => m.role !== "system").slice(-6),
        userMsg,
      ];

      let placeholderAdded = false;
      const full = await streamChat({
        modelKey,
        messages: chatMessages,
        onToken: (_delta, fullSoFar) => {
          setMessages((m) => {
            const copy = [...m];
            if (!placeholderAdded) {
              copy.push({ role: "assistant", content: fullSoFar });
              placeholderAdded = true;
            } else {
              copy[copy.length - 1] = { role: "assistant", content: fullSoFar };
            }
            return copy;
          });
        },
      });

      if (!full) {
        setMessages((m) => [...m, { role: "assistant", content: "(no response generated)" }]);
      }
    } catch (e) {
      setMessages((m) => [...m, { role: "assistant", content: `⚠️ ${e.message || "Local inference failed."}` }]);
    }
    setStreaming(false);
  }

  // ── Unsupported browser ──────────────────────────────────────
  if (!gpuOk) {
    return (
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 32, textAlign: "center" }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>🧠</div>
        <h3 style={{ color: C.accent, margin: "0 0 10px" }}>On-Device AI Copilot</h3>
        <p style={{ color: C.muted, maxWidth: 480, margin: "0 auto", lineHeight: 1.6 }}>
          This browser doesn't support WebGPU, which the local AI model needs to run.
          Try the latest version of <strong style={{ color: C.text }}>Chrome</strong> or <strong style={{ color: C.text }}>Edge</strong> on desktop or Android.
        </p>
      </div>
    );
  }

  // ── Likely-insufficient-memory device (e.g. phone) ───────────
  if (deviceProfile.likelyInsufficientMemory && !proceedAnyway) {
    return (
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 32, textAlign: "center" }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>📱</div>
        <h3 style={{ color: C.warn, margin: "0 0 10px" }}>This device may not have enough memory</h3>
        <p style={{ color: C.muted, maxWidth: 480, margin: "0 auto", lineHeight: 1.6 }}>
          The on-device AI model is 1.5–2.5GB and needs to fit in your browser tab's memory alongside
          the app itself. On phones this often crashes the tab entirely rather than showing an error.
          For the best experience, use the Copilot on a <strong style={{ color: C.text }}>laptop or desktop</strong>.
        </p>
        <button
          onClick={() => setProceedAnyway(true)}
          style={{
            marginTop: 18, padding: "10px 18px", borderRadius: 8,
            border: `1px solid ${C.border}`, background: "transparent",
            color: C.muted, fontSize: 13, cursor: "pointer",
          }}
        >
          Try anyway (may crash the tab)
        </button>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
        <h3 style={{ margin: 0, color: C.accent, fontSize: 18 }}>🧠 AI Health Copilot <span style={{ fontSize: 11, color: C.accent2, border: `1px solid ${C.accent2}44`, borderRadius: 6, padding: "2px 8px", marginLeft: 8 }}>ON-DEVICE · OFFLINE</span></h3>
        {!isOnline && <span style={{ fontSize: 12, color: C.warn }}>⚠ Offline — using cached data if available</span>}
      </div>

      {/* ── Setup controls ── */}
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 20, marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <select value={patientId} onChange={(e) => setPatientId(e.target.value)} style={selectStyle} disabled={stage === "loading-model" || stage === "indexing"}>
            {patients.map((p) => (
              <option key={p.patient_id} value={p.patient_id}>{p.name} ({p.patient_id})</option>
            ))}
          </select>

          <select value={modelKey} onChange={(e) => setModelKey(e.target.value)} style={selectStyle} disabled={stage === "loading-model" || stage === "indexing"}>
            {Object.entries(MODELS).map(([key, m]) => (
              <option key={key} value={key}>{m.label}</option>
            ))}
          </select>

          <button
            onClick={initialize}
            disabled={!patientId || stage === "loading-model" || stage === "indexing"}
            style={{
              padding: "10px 18px", borderRadius: 8, border: "none",
              background: C.accent, color: C.bg, fontWeight: 700, cursor: "pointer",
              opacity: (!patientId || stage === "loading-model" || stage === "indexing") ? 0.6 : 1,
            }}
          >
            {stage === "ready" ? "↻ Reload Copilot" : "▶ Start Local AI"}
          </button>

          {(stage === "loading-model" || stage === "indexing") && (
            <span style={{ color: C.muted, fontSize: 13 }}>{loadText} {loadPct > 0 && stage === "loading-model" ? `(${loadPct}%)` : ""}</span>
          )}
        </div>

        {(stage === "loading-model") && (
          <div style={{ marginTop: 12, background: "rgba(255,255,255,0.06)", borderRadius: 6, height: 8, overflow: "hidden" }}>
            <div style={{ width: `${loadPct}%`, height: 8, background: C.accent, transition: "width 0.3s" }} />
          </div>
        )}

        {stage === "idle" && !setupError && (
          <p style={{ color: C.muted, fontSize: 13, marginTop: 12, marginBottom: 0, lineHeight: 1.6 }}>
            The first load downloads a small language model (1.5–2.5GB) directly to your browser — this happens once and is cached for offline use afterward. No data ever leaves this device.
          </p>
        )}

        {fallbackNotice && (
          <p style={{ color: C.warn, fontSize: 13, marginTop: 12, marginBottom: 0 }}>{fallbackNotice}</p>
        )}

        {setupError && (
          <p style={{ color: C.danger, fontSize: 13, marginTop: 12, marginBottom: 0 }}>
            ⚠️ {setupError}
            {driverIssue && (
              <> This isn't fixed by picking a smaller model — try updating your graphics driver, check <code>chrome://gpu</code> for warnings, or test on a different device.</>
            )}
            {!driverIssue && setupError.toLowerCase().includes("memory") && modelKey !== "gemma-2-2b" && (
              <> Try selecting <strong>{MODELS["gemma-2-2b"].label}</strong> above and starting again.</>
            )}
          </p>
        )}
      </div>

      {/* ── Quick actions ── */}
      {stage === "ready" && (
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
          {QUICK_ACTIONS.map((qa) => (
            <button key={qa.id} onClick={() => ask(qa.prompt)} disabled={streaming}
              style={{
                background: "rgba(59,201,232,0.08)", border: `1px solid ${C.border}`,
                color: C.text, borderRadius: 10, padding: "10px 16px", fontSize: 13,
                cursor: streaming ? "not-allowed" : "pointer", fontWeight: 600,
                opacity: streaming ? 0.6 : 1,
              }}>
              {qa.icon} {qa.label}
            </button>
          ))}
        </div>
      )}

      {/* ── Chat ── */}
      {(stage === "ready" || messages.length > 0) && (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 20, display: "flex", flexDirection: "column", height: 480 }}>
          <div style={{ flex: 1, overflowY: "auto", marginBottom: 12, display: "flex", flexDirection: "column", gap: 12 }}>
            {messages.map((m, i) => (
              <div key={i} style={{
                alignSelf: m.role === "user" ? "flex-end" : "flex-start",
                maxWidth: "80%",
                background: m.role === "user" ? C.accent + "22" : "rgba(255,255,255,0.05)",
                border: `1px solid ${m.role === "user" ? C.accent + "44" : C.border}`,
                borderRadius: 12, padding: "10px 14px", fontSize: 14, lineHeight: 1.6,
                color: C.text, whiteSpace: "pre-wrap",
              }}>
                {m.content}
              </div>
            ))}
            {streaming && messages[messages.length - 1]?.role === "user" && (
              <div style={{ alignSelf: "flex-start", color: C.muted, fontSize: 13 }}>🧠 thinking locally...</div>
            )}
            <div ref={chatEndRef} />
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); ask(input); } }}
              placeholder={stage === "ready" ? "Ask about your health data..." : "Start the local AI above first..."}
              disabled={stage !== "ready" || streaming}
              style={{ ...selectStyle, flex: 1 }}
            />
            <button onClick={() => ask(input)} disabled={stage !== "ready" || streaming || !input.trim()}
              style={{
                padding: "10px 18px", borderRadius: 8, border: "none",
                background: C.accent2, color: C.bg, fontWeight: 700, cursor: "pointer",
                opacity: (stage !== "ready" || streaming || !input.trim()) ? 0.5 : 1,
              }}>
              Send
            </button>
          </div>
        </div>
      )}

      <p style={{ color: C.muted, fontSize: 11, marginTop: 14, lineHeight: 1.6 }}>
        🔒 All inference and data retrieval for the Copilot happen locally in your browser via WebGPU/WASM. Nothing is sent to HealNet's servers or any third party. This is not a substitute for professional medical advice.
      </p>
    </div>
  );
}
