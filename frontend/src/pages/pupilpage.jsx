import { useState, useRef } from "react";
import { pupilAPI } from "../services/api";

const C = {
  bg: "#030c2c", card: "#04163c", border: "rgba(59,201,232,0.18)",
  accent: "#3BC9E8", accent2: "#00f5a0", danger: "#ff4d6d",
  warn: "#ffd166", text: "#e8f4f8", muted: "rgba(232,244,248,0.5)",
};
const css = (s) => s;

// ── PIR Gauge bar ─────────────────────────────────────────────────
function PIRBar({ pir }) {
  const pct = Math.min(100, Math.max(0, pir * 100));
  const color = pir < 0.18 ? C.warn : pir > 0.50 ? C.danger : C.accent2;
  return (
    <div>
      <div style={css({ display: "flex", justifyContent: "space-between", fontSize: 12, color: C.muted, marginBottom: 4 })}>
        <span>Constricted</span><span>Normal</span><span>Dilated</span>
      </div>
      <div style={css({ background: "rgba(255,255,255,0.07)", borderRadius: 6, height: 10, position: "relative" })}>
        {/* Normal zone highlight */}
        <div style={css({ position: "absolute", left: "20%", width: "25%", height: "100%", background: "rgba(0,245,160,0.15)", borderRadius: 4 })} />
        {/* Indicator */}
        <div style={css({ position: "absolute", left: `${pct}%`, top: -3, width: 4, height: 16, background: color, borderRadius: 2, transform: "translateX(-50%)", transition: "left 0.5s ease" })} />
      </div>
      <div style={css({ textAlign: "center", marginTop: 6, fontSize: 13, fontWeight: 700, color })}>
        PIR = {pir.toFixed(3)} &nbsp;|&nbsp; Normal: 0.20 – 0.45
      </div>
    </div>
  );
}

// ── Severity badge ────────────────────────────────────────────────
function SevBadge({ severity }) {
  const map = {
    NORMAL:   C.accent2, MILD: C.warn,
    MODERATE: "#f57c00", SEVERE: C.danger, ERROR: C.muted
  };
  const color = map[severity] || C.muted;
  return (
    <span style={css({
      background: color + "22", color, border: `1px solid ${color}66`,
      borderRadius: 6, padding: "4px 14px", fontSize: 13, fontWeight: 800, letterSpacing: 1,
    })}>
      {severity}
    </span>
  );
}

// ── Single result card ────────────────────────────────────────────
function ResultCard({ result, label }) {
  if (!result) return null;
  if (result.error) return (
    <div style={css({ color: C.danger, padding: 20 })}>❌ {result.error}</div>
  );

  return (
    <div style={css({ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 20 })}>
      {label && <h4 style={css({ color: C.accent, marginBottom: 16, fontSize: 15 })}>{label}</h4>}

      <div style={css({ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 })}>
        {/* Annotated image */}
        <div>
          {result.annotated_image ? (
            <img
              src={`data:image/jpeg;base64,${result.annotated_image}`}
              alt="Annotated eye"
              style={css({ width: "100%", borderRadius: 10, border: `1px solid ${C.border}` })}
            />
          ) : (
            <div style={css({ background: "rgba(59,201,232,0.05)", borderRadius: 10, height: 160, display: "flex", alignItems: "center", justifyContent: "center", color: C.muted, fontSize: 13 })}>
              No annotated image
            </div>
          )}
        </div>

        {/* Key metrics */}
        <div>
          <div style={css({ marginBottom: 12 })}><SevBadge severity={result.severity} /></div>
          <div style={css({ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 12 })}>
            {[
              ["PIR",         result.pupil_iris_ratio?.toFixed(3)],
              ["Pupil px",    result.pupil_radius_px?.toFixed(1)],
              ["Iris px",     result.iris_radius_px?.toFixed(1)],
              ["Circularity", result.circularity?.toFixed(2)],
              ["Confidence",  result.confidence + "%"],
              ["Quality",     result.quality_grade],
            ].map(([k, v]) => (
              <div key={k} style={css({ background: "rgba(59,201,232,0.06)", borderRadius: 8, padding: "8px 10px", textAlign: "center" })}>
                <div style={css({ fontSize: 10, color: C.muted, marginBottom: 3 })}>{k}</div>
                <div style={css({ fontSize: 15, fontWeight: 700, color: C.accent })}>{v}</div>
              </div>
            ))}
          </div>

          {/* Flags */}
          <div style={css({ fontSize: 13, lineHeight: 1.8 })}>
            {result.is_dilated     && <div style={css({ color: C.danger })}>🔵 Dilated (Mydriasis)</div>}
            {result.is_constricted && <div style={css({ color: C.warn })}>🟡 Constricted (Miosis)</div>}
            {result.is_irregular   && <div style={css({ color: "#f57c00" })}>🟠 Irregular Shape</div>}
            {!result.is_dilated && !result.is_constricted && !result.is_irregular &&
              <div style={css({ color: C.accent2 })}>✅ No flags</div>
            }
          </div>
        </div>
      </div>

      {/* PIR gauge */}
      <div style={css({ marginBottom: 16 })}><PIRBar pir={result.pupil_iris_ratio || 0} /></div>

      {/* Clinical notes */}
      {result.clinical_notes?.length > 0 && (
        <div style={css({ background: "rgba(59,201,232,0.04)", borderRadius: 10, padding: 14, marginBottom: 12 })}>
          <div style={css({ fontSize: 12, color: C.muted, marginBottom: 8, fontWeight: 700, letterSpacing: 1 })}>CLINICAL NOTES</div>
          {result.clinical_notes.map((n, i) => (
            <div key={i} style={css({ fontSize: 13, color: C.text, marginBottom: 4 })}>• {n}</div>
          ))}
        </div>
      )}

      {/* Possible causes */}
      {result.possible_causes?.length > 0 && !result.possible_causes[0].startsWith("No abnormality") && (
        <div style={css({ background: "rgba(255,77,109,0.05)", borderRadius: 10, padding: 14 })}>
          <div style={css({ fontSize: 12, color: C.muted, marginBottom: 8, fontWeight: 700, letterSpacing: 1 })}>POSSIBLE CAUSES</div>
          {result.possible_causes.map((c, i) => (
            <div key={i} style={css({ fontSize: 13, color: C.text, marginBottom: 4 })}>• {c}</div>
          ))}
          <div style={css({ fontSize: 11, color: C.muted, marginTop: 8 })}>
            ⚠️ AI-assisted screening only. Confirm with a licensed clinician.
          </div>
        </div>
      )}

      {result.possible_causes?.[0]?.startsWith("No abnormality") && (
        <div style={css({ color: C.accent2, fontSize: 13, padding: "10px 0" })}>
          ✅ No significant abnormality detected. Routine follow-up as advised.
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
//  MAIN PAGE
// ═══════════════════════════════════════════════════════════════════
export default function PupilPage() {
  const [mode, setMode]       = useState("single"); // single | dual
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");

  // Single mode
  const [singleFile, setSingleFile]     = useState(null);
  const [singlePreview, setSinglePreview] = useState(null);
  const [singleResult, setSingleResult] = useState(null);

  // Dual mode
  const [leftFile, setLeftFile]       = useState(null);
  const [rightFile, setRightFile]     = useState(null);
  const [leftPreview, setLeftPreview] = useState(null);
  const [rightPreview, setRightPreview] = useState(null);
  const [dualResult, setDualResult]   = useState(null);

  const singleRef = useRef();
  const leftRef   = useRef();
  const rightRef  = useRef();

  function onFile(e, setter, previewSetter) {
    const file = e.target.files[0];
    if (!file) return;
    setter(file);
    previewSetter(URL.createObjectURL(file));
  }

  async function analyzeSingle() {
    if (!singleFile) { setError("Please upload an image first"); return; }
    setLoading(true); setError(""); setSingleResult(null);
    try {
      const res = await pupilAPI.analyzeSingle(singleFile);
      setSingleResult(res.data);
    } catch (e) {
      setError(e.response?.data?.detail || "Analysis failed");
    }
    setLoading(false);
  }

  async function analyzeDual() {
    if (!leftFile && !rightFile) { setError("Upload at least one eye image"); return; }
    setLoading(true); setError(""); setDualResult(null);
    try {
      const res = await pupilAPI.analyzeBoth(leftFile, rightFile);
      setDualResult(res.data);
    } catch (e) {
      setError(e.response?.data?.detail || "Analysis failed");
    }
    setLoading(false);
  }

  const inputStyle = css({
    display: "none"
  });

  const uploadBoxStyle = (preview) => css({
    width: "100%", minHeight: 160, borderRadius: 12,
    border: `2px dashed ${preview ? C.accent : C.border}`,
    background: preview ? "transparent" : "rgba(59,201,232,0.04)",
    display: "flex", flexDirection: "column",
    alignItems: "center", justifyContent: "center",
    cursor: "pointer", transition: "all 0.2s", overflow: "hidden",
  });

  return (
    <div style={css({ fontFamily: "'Segoe UI', sans-serif", color: C.text })}>
      <h2 style={css({ margin: "0 0 6px", fontSize: 22 })}>👁 Pupil Detection & Analysis</h2>
      <p style={css({ color: C.muted, fontSize: 14, marginBottom: 24 })}>
        AI-powered screening for dilation, constriction, anisocoria, and shape irregularities.
      </p>

      {/* Mode tabs */}
      <div style={css({ display: "flex", gap: 8, marginBottom: 24 })}>
        {[
          { id: "single", label: "📤 Single Eye" },
          { id: "dual",   label: "👥 Dual Eye (Anisocoria)" },
        ].map(m => (
          <button key={m.id} onClick={() => { setMode(m.id); setError(""); setSingleResult(null); setDualResult(null); }}
            style={css({
              padding: "10px 20px", borderRadius: 10, border: "none", cursor: "pointer",
              fontWeight: 600, fontSize: 14,
              background: mode === m.id ? C.accent : "rgba(59,201,232,0.08)",
              color: mode === m.id ? C.bg : C.muted,
            })}>
            {m.label}
          </button>
        ))}
      </div>

      {/* ── SINGLE MODE ────────────────────────────────────────────── */}
      {mode === "single" && (
        <div>
          <div style={css({ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 20 })}>
            <div>
              <div style={css({ fontSize: 13, color: C.muted, marginBottom: 8 })}>Upload eye image</div>
              <div style={uploadBoxStyle(singlePreview)} onClick={() => singleRef.current.click()}>
                <input ref={singleRef} type="file" accept="image/*" style={inputStyle}
                  onChange={e => onFile(e, setSingleFile, setSinglePreview)} />
                {singlePreview
                  ? <img src={singlePreview} alt="preview" style={css({ width: "100%", borderRadius: 10 })} />
                  : <>
                      <div style={css({ fontSize: 32, marginBottom: 8 })}>👁</div>
                      <div style={css({ color: C.muted, fontSize: 13 })}>Click to upload</div>
                      <div style={css({ color: C.muted, fontSize: 11, marginTop: 4 })}>PNG, JPG, JPEG</div>
                    </>
                }
              </div>
            </div>

            <div style={css({ background: "rgba(59,201,232,0.04)", borderRadius: 12, padding: 20 })}>
              <div style={css({ fontSize: 13, fontWeight: 700, color: C.accent, marginBottom: 12 })}>Tips for best results</div>
              {[
                "Use a close-up, well-lit photo",
                "Avoid heavy flash (red-eye effect)",
                "One eye per image",
                "Minimum 200 × 200 px",
                "Keep subject still and in focus",
              ].map((t, i) => (
                <div key={i} style={css({ fontSize: 13, color: C.muted, marginBottom: 6 })}>• {t}</div>
              ))}
            </div>
          </div>

          {error && <div style={css({ color: C.danger, fontSize: 13, marginBottom: 12 })}>⚠️ {error}</div>}

          <button onClick={analyzeSingle} disabled={loading || !singleFile}
            style={css({
              padding: "12px 32px", borderRadius: 10, border: "none",
              background: loading || !singleFile ? "rgba(59,201,232,0.3)" : C.accent,
              color: C.bg, fontWeight: 700, fontSize: 15,
              cursor: loading || !singleFile ? "not-allowed" : "pointer", marginBottom: 24,
            })}>
            {loading ? "🔍 Analysing..." : "🔍 Analyse Pupil"}
          </button>

          {singleResult && <ResultCard result={singleResult} label="Analysis Result" />}
        </div>
      )}

      {/* ── DUAL MODE ──────────────────────────────────────────────── */}
      {mode === "dual" && (
        <div>
          <div style={css({ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 20 })}>
            {/* Left eye */}
            <div>
              <div style={css({ fontSize: 13, color: C.muted, marginBottom: 8 })}>Left Eye</div>
              <div style={uploadBoxStyle(leftPreview)} onClick={() => leftRef.current.click()}>
                <input ref={leftRef} type="file" accept="image/*" style={inputStyle}
                  onChange={e => onFile(e, setLeftFile, setLeftPreview)} />
                {leftPreview
                  ? <img src={leftPreview} alt="left" style={css({ width: "100%", borderRadius: 10 })} />
                  : <>
                      <div style={css({ fontSize: 32, marginBottom: 8 })}>👁</div>
                      <div style={css({ color: C.muted, fontSize: 13 })}>Upload left eye</div>
                    </>
                }
              </div>
            </div>

            {/* Right eye */}
            <div>
              <div style={css({ fontSize: 13, color: C.muted, marginBottom: 8 })}>Right Eye</div>
              <div style={uploadBoxStyle(rightPreview)} onClick={() => rightRef.current.click()}>
                <input ref={rightRef} type="file" accept="image/*" style={inputStyle}
                  onChange={e => onFile(e, setRightFile, setRightPreview)} />
                {rightPreview
                  ? <img src={rightPreview} alt="right" style={css({ width: "100%", borderRadius: 10 })} />
                  : <>
                      <div style={css({ fontSize: 32, marginBottom: 8 })}>👁</div>
                      <div style={css({ color: C.muted, fontSize: 13 })}>Upload right eye</div>
                    </>
                }
              </div>
            </div>
          </div>

          {error && <div style={css({ color: C.danger, fontSize: 13, marginBottom: 12 })}>⚠️ {error}</div>}

          <button onClick={analyzeDual} disabled={loading || (!leftFile && !rightFile)}
            style={css({
              padding: "12px 32px", borderRadius: 10, border: "none",
              background: loading || (!leftFile && !rightFile) ? "rgba(59,201,232,0.3)" : C.accent,
              color: C.bg, fontWeight: 700, fontSize: 15,
              cursor: loading || (!leftFile && !rightFile) ? "not-allowed" : "pointer", marginBottom: 24,
            })}>
            {loading ? "🔍 Analysing both eyes..." : "🔍 Run Dual-Eye Analysis"}
          </button>

          {/* Anisocoria result */}
          {dualResult && (
            <div>
              {dualResult.anisocoria ? (
                <div style={css({
                  background: "rgba(255,77,109,0.08)", border: `1px solid rgba(255,77,109,0.3)`,
                  borderLeft: `4px solid ${C.danger}`, borderRadius: 12, padding: 16, marginBottom: 20,
                })}>
                  <div style={css({ color: C.danger, fontWeight: 700, fontSize: 15, marginBottom: 8 })}>
                    ⚠️ Anisocoria Detected &nbsp;
                    <span style={css({
                      background: C.danger + "22", color: C.danger,
                      border: `1px solid ${C.danger}66`, borderRadius: 6,
                      padding: "2px 10px", fontSize: 12, fontWeight: 800,
                    })}>{dualResult.anisocoria_severity}</span>
                  </div>
                  {dualResult.anisocoria_notes?.map((n, i) => (
                    <div key={i} style={css({ fontSize: 13, color: C.text, marginBottom: 4 })}>• {n}</div>
                  ))}
                </div>
              ) : (
                <div style={css({
                  background: "rgba(0,245,160,0.08)", border: `1px solid rgba(0,245,160,0.3)`,
                  borderRadius: 12, padding: 14, marginBottom: 20, color: C.accent2, fontSize: 14,
                })}>
                  ✅ No anisocoria detected — pupils appear symmetric.
                </div>
              )}

              <div style={css({ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 })}>
                <ResultCard result={dualResult.left}  label="Left Eye" />
                <ResultCard result={dualResult.right} label="Right Eye" />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Reference guide */}
      <div style={css({ marginTop: 32, background: "rgba(59,201,232,0.04)", borderRadius: 12, padding: 20 })}>
        <div style={css({ fontSize: 13, fontWeight: 700, color: C.accent, marginBottom: 12 })}>
          📖 PIR Reference Guide
        </div>
        <table style={css({ width: "100%", borderCollapse: "collapse", fontSize: 13 })}>
          <thead>
            <tr>
              {["PIR Range", "Condition", "Severity"].map(h => (
                <th key={h} style={css({ textAlign: "left", color: C.muted, padding: "6px 12px", borderBottom: `1px solid ${C.border}`, fontWeight: 600, fontSize: 11 })}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[
              ["< 0.18",      "Constricted (Miosis)",    C.danger,  "Moderate – Severe"],
              ["0.18 – 0.20", "Borderline Miosis",        C.warn,    "Mild"],
              ["0.20 – 0.45", "Normal",                   C.accent2, "✅ Normal"],
              ["0.45 – 0.50", "Borderline Mydriasis",     C.warn,    "Mild"],
              ["> 0.50",      "Dilated (Mydriasis)",      C.danger,  "Moderate – Severe"],
            ].map(([range, cond, color, sev]) => (
              <tr key={range} style={css({ borderBottom: `1px solid ${C.border}44` })}>
                <td style={css({ padding: "8px 12px", fontFamily: "monospace", color: C.accent })}>{range}</td>
                <td style={css({ padding: "8px 12px", color })}>{cond}</td>
                <td style={css({ padding: "8px 12px", color: C.muted })}>{sev}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
