import { useState, useRef, useEffect, useCallback } from "react";
import { vitalsAPI, patientsAPI } from "../services/api";

const C = {
  bg: "#030c2c", card: "#04163c", border: "rgba(59,201,232,0.18)",
  accent: "#3BC9E8", accent2: "#00f5a0", danger: "#ff4d6d",
  warn: "#ffd166", text: "#e8f4f8", muted: "rgba(232,244,248,0.5)",
};
const css = (s) => s;

// ── Vital display card ────────────────────────────────────────────
function VitalCard({ icon, label, value, unit, status }) {
  const statusColor = {
    normal:   C.accent2,
    warning:  C.warn,
    critical: C.danger,
    measuring: C.accent,
  }[status] || C.muted;

  return (
    <div style={css({
      background: C.card, border: `1px solid ${statusColor}44`,
      borderRadius: 14, padding: 20, textAlign: "center",
    })}>
      <div style={css({ fontSize: 28, marginBottom: 8 })}>{icon}</div>
      <div style={css({ fontSize: 11, color: C.muted, letterSpacing: 2, marginBottom: 6 })}>{label}</div>
      {value !== null ? (
        <>
          <div style={css({ fontSize: 36, fontWeight: 800, color: statusColor })}>{value}</div>
          <div style={css({ fontSize: 12, color: C.muted, marginTop: 4 })}>{unit}</div>
        </>
      ) : (
        <div style={css({ fontSize: 14, color: C.muted, fontStyle: "italic" })}>—</div>
      )}
    </div>
  );
}

// ── Pulse animation dot ───────────────────────────────────────────
function PulseDot({ active }) {
  return (
    <span style={css({
      display: "inline-block", width: 10, height: 10, borderRadius: "50%",
      background: active ? C.danger : C.muted,
      boxShadow: active ? `0 0 0 4px ${C.danger}33` : "none",
      animation: active ? "pulse 1s infinite" : "none",
      marginRight: 8,
      transition: "all 0.3s",
    })} />
  );
}

// ═══════════════════════════════════════════════════════════════════
//  MAIN PAGE
// ═══════════════════════════════════════════════════════════════════
export default function CameraPage() {
  const videoRef    = useRef(null);
  const canvasRef   = useRef(null);
  const streamRef   = useRef(null);
  const intervalRef = useRef(null);
  const frameCount  = useRef(0);
  const brightVals  = useRef([]);

  const [patients, setPatients]     = useState([]);
  const [patientId, setPatientId]   = useState("");
  const [camActive, setCamActive]   = useState(false);
  const [measuring, setMeasuring]   = useState(false);
  const [progress, setProgress]     = useState(0);
  const [saved, setSaved]           = useState(false);
  const [error, setError]           = useState("");

  const [heartRate,   setHeartRate]   = useState(null);
  const [hrStatus,    setHrStatus]    = useState("normal");
  const [manualVitals, setManualVitals] = useState({
    spo2: "", systolic_bp: "", diastolic_bp: "",
    temperature: "", blood_sugar: "",
  });

  // Load patients on mount
  useEffect(() => {
    patientsAPI.getAll().then(r => setPatients(r.data)).catch(() => {});
    return () => stopCamera();
  }, []);

  // ── Camera ────────────────────────────────────────────────────
  async function startCamera() {
    setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: 320, height: 240 }
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCamActive(true);
    } catch (e) {
      setError("Camera access denied. Please allow camera permission and try again.");
    }
  }

  function stopCamera() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (intervalRef.current) clearInterval(intervalRef.current);
    setCamActive(false);
    setMeasuring(false);
    setProgress(0);
  }

  // ── Heart Rate Measurement (rPPG — brightness fluctuation) ────
  const MEASURE_DURATION = 30;  // seconds
  const SAMPLE_RATE      = 15;  // frames/sec

  function getFrameBrightness() {
    const video  = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return null;
    const ctx = canvas.getContext("2d");
    canvas.width = 80; canvas.height = 60;
    ctx.drawImage(video, 0, 0, 80, 60);
    const data = ctx.getImageData(30, 20, 20, 20).data;
    let r = 0;
    for (let i = 0; i < data.length; i += 4) r += data[i];
    return r / (data.length / 4);
  }

  function estimateHR(signal) {
    if (signal.length < 20) return null;

    // Detrend
    const mean = signal.reduce((a, b) => a + b, 0) / signal.length;
    const detrended = signal.map(v => v - mean);

    // Count zero crossings (upward) → estimate frequency
    let crossings = 0;
    for (let i = 1; i < detrended.length; i++) {
      if (detrended[i - 1] < 0 && detrended[i] >= 0) crossings++;
    }

    const durationSec = signal.length / SAMPLE_RATE;
    const beatsPerSec = crossings / durationSec;
    const bpm = Math.round(beatsPerSec * 60);

    // Physiologically plausible range
    if (bpm < 40 || bpm > 180) return null;
    return bpm;
  }

  function startMeasurement() {
    if (!camActive) { setError("Start camera first"); return; }
    frameCount.current = 0;
    brightVals.current = [];
    setMeasuring(true);
    setProgress(0);
    setHeartRate(null);
    setSaved(false);

    intervalRef.current = setInterval(() => {
      const brightness = getFrameBrightness();
      if (brightness !== null) brightVals.current.push(brightness);

      frameCount.current += 1;
      const pct = Math.min(100, Math.round((frameCount.current / (MEASURE_DURATION * SAMPLE_RATE)) * 100));
      setProgress(pct);

      if (frameCount.current >= MEASURE_DURATION * SAMPLE_RATE) {
        clearInterval(intervalRef.current);
        setMeasuring(false);

        const hr = estimateHR(brightVals.current);
        if (hr) {
          setHeartRate(hr);
          setHrStatus(hr > 100 || hr < 55 ? (hr > 120 || hr < 40 ? "critical" : "warning") : "normal");
        } else {
          setError("Could not estimate heart rate. Ensure your face is well-lit and stay still.");
        }
      }
    }, 1000 / SAMPLE_RATE);
  }

  // ── Save all vitals to Supabase ───────────────────────────────
  async function saveVitals() {
    if (!patientId) { setError("Select a patient first"); return; }
    setError(""); setSaved(false);

    const data = {
      patient_id:   patientId,
      source:       "camera",
      heart_rate:   heartRate || undefined,
      spo2:         manualVitals.spo2         ? parseFloat(manualVitals.spo2)         : undefined,
      systolic_bp:  manualVitals.systolic_bp  ? parseFloat(manualVitals.systolic_bp)  : undefined,
      diastolic_bp: manualVitals.diastolic_bp ? parseFloat(manualVitals.diastolic_bp) : undefined,
      temperature:  manualVitals.temperature  ? parseFloat(manualVitals.temperature)  : undefined,
      blood_sugar:  manualVitals.blood_sugar  ? parseFloat(manualVitals.blood_sugar)  : undefined,
    };

    try {
      await vitalsAPI.record(data);
      setSaved(true);
    } catch (e) {
      setError(e.response?.data?.detail || "Failed to save vitals");
    }
  }

  const inputStyle = css({
    width: "100%", padding: "10px 14px", borderRadius: 8,
    background: "rgba(59,201,232,0.07)", border: `1px solid ${C.border}`,
    color: C.text, fontSize: 14, outline: "none",
    boxSizing: "border-box", fontFamily: "inherit",
  });

  const setMV = (k) => (e) => setManualVitals(v => ({ ...v, [k]: e.target.value }));

  return (
    <div style={css({ fontFamily: "'Segoe UI', sans-serif", color: C.text })}>
      <style>{`
        @keyframes pulse { 0%,100%{box-shadow:0 0 0 4px rgba(255,77,109,0.3)} 50%{box-shadow:0 0 0 8px rgba(255,77,109,0.1)} }
      `}</style>

      <h2 style={css({ margin: "0 0 6px", fontSize: 22 })}>📷 Camera Vitals</h2>
      <p style={css({ color: C.muted, fontSize: 14, marginBottom: 24 })}>
        Measure heart rate using your camera via rPPG (remote photoplethysmography). No hardware needed.
      </p>

      <div style={css({ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 })}>

        {/* ── LEFT: Camera + controls ─────────────────────────── */}
        <div>
          {/* Patient selector */}
          <div style={css({ marginBottom: 16 })}>
            <div style={css({ fontSize: 12, color: C.muted, marginBottom: 6 })}>SELECT PATIENT</div>
            <select value={patientId} onChange={e => setPatientId(e.target.value)} style={inputStyle}>
              <option value="">— Choose patient —</option>
              {patients.map(p => (
                <option key={p.patient_id} value={p.patient_id}>
                  {p.name} ({p.patient_id})
                </option>
              ))}
            </select>
          </div>

          {/* Camera feed */}
          <div style={css({
            background: "#000", borderRadius: 14, overflow: "hidden",
            border: `1px solid ${camActive ? C.accent : C.border}`,
            marginBottom: 16, position: "relative", aspectRatio: "4/3",
            display: "flex", alignItems: "center", justifyContent: "center",
          })}>
            <video ref={videoRef} muted playsInline
              style={css({ width: "100%", height: "100%", objectFit: "cover", display: camActive ? "block" : "none" })} />
            <canvas ref={canvasRef} style={{ display: "none" }} />

            {!camActive && (
              <div style={css({ textAlign: "center", color: C.muted })}>
                <div style={css({ fontSize: 48, marginBottom: 8 })}>📷</div>
                <div style={css({ fontSize: 14 })}>Camera off</div>
              </div>
            )}

            {/* Measuring overlay */}
            {measuring && (
              <div style={css({
                position: "absolute", inset: 0,
                background: "rgba(3,12,44,0.7)",
                display: "flex", flexDirection: "column",
                alignItems: "center", justifyContent: "center",
              })}>
                <PulseDot active={true} />
                <div style={css({ color: C.text, fontSize: 14, fontWeight: 600, marginTop: 8 })}>
                  Measuring... {progress}%
                </div>
                <div style={css({
                  width: "80%", height: 6, background: "rgba(255,255,255,0.1)",
                  borderRadius: 3, marginTop: 12, overflow: "hidden",
                })}>
                  <div style={css({
                    width: `${progress}%`, height: "100%",
                    background: C.danger, borderRadius: 3, transition: "width 0.2s",
                  })} />
                </div>
                <div style={css({ color: C.muted, fontSize: 12, marginTop: 8 })}>
                  Stay still. Keep face centered.
                </div>
              </div>
            )}
          </div>

          {/* Camera buttons */}
          <div style={css({ display: "flex", gap: 10, marginBottom: 16 })}>
            {!camActive ? (
              <button onClick={startCamera}
                style={css({ flex: 1, padding: "11px", borderRadius: 10, border: "none", background: C.accent, color: C.bg, fontWeight: 700, cursor: "pointer" })}>
                📷 Start Camera
              </button>
            ) : (
              <button onClick={stopCamera}
                style={css({ flex: 1, padding: "11px", borderRadius: 10, border: `1px solid ${C.danger}`, background: "transparent", color: C.danger, fontWeight: 700, cursor: "pointer" })}>
                ⏹ Stop Camera
              </button>
            )}
            <button onClick={startMeasurement} disabled={!camActive || measuring}
              style={css({
                flex: 1, padding: "11px", borderRadius: 10, border: "none",
                background: !camActive || measuring ? "rgba(255,77,109,0.3)" : C.danger,
                color: "#fff", fontWeight: 700,
                cursor: !camActive || measuring ? "not-allowed" : "pointer",
              })}>
              {measuring ? `Measuring ${progress}%` : "❤️ Measure HR"}
            </button>
          </div>

          {/* Instructions */}
          <div style={css({ background: "rgba(59,201,232,0.04)", borderRadius: 10, padding: 14 })}>
            <div style={css({ fontSize: 12, fontWeight: 700, color: C.accent, marginBottom: 8 })}>HOW IT WORKS</div>
            {[
              "1. Select a patient",
              "2. Click Start Camera",
              "3. Click Measure HR — stay still for 30 seconds",
              "4. Enter any other vitals manually below",
              "5. Click Save Vitals",
            ].map((t, i) => (
              <div key={i} style={css({ fontSize: 13, color: C.muted, marginBottom: 4 })}>{t}</div>
            ))}
          </div>
        </div>

        {/* ── RIGHT: Vitals display + manual entry ─────────────── */}
        <div>
          {/* Vital cards */}
          <div style={css({ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 })}>
            <VitalCard icon="❤️" label="HEART RATE" value={heartRate} unit="bpm" status={measuring ? "measuring" : hrStatus} />
            <VitalCard icon="🫁" label="SPO2"       value={manualVitals.spo2 || null} unit="%" status="normal" />
            <VitalCard icon="🩸" label="BLOOD PRESSURE"
              value={manualVitals.systolic_bp ? `${manualVitals.systolic_bp}/${manualVitals.diastolic_bp || "?"}` : null}
              unit="mmHg" status="normal" />
            <VitalCard icon="🌡️" label="TEMPERATURE" value={manualVitals.temperature || null} unit="°C" status="normal" />
          </div>

          {/* Manual vitals entry */}
          <div style={css({ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 20, marginBottom: 16 })}>
            <div style={css({ fontSize: 12, fontWeight: 700, color: C.accent, marginBottom: 14, letterSpacing: 1 })}>
              ENTER OTHER VITALS MANUALLY
            </div>
            <div style={css({ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 })}>
              {[
                ["spo2",         "SpO2 (%)"],
                ["systolic_bp",  "Systolic BP"],
                ["diastolic_bp", "Diastolic BP"],
                ["temperature",  "Temperature (°C)"],
                ["blood_sugar",  "Blood Sugar (mg/dL)"],
              ].map(([k, label]) => (
                <div key={k}>
                  <div style={css({ fontSize: 11, color: C.muted, marginBottom: 4 })}>{label}</div>
                  <input type="number" placeholder="—" value={manualVitals[k]} onChange={setMV(k)} style={inputStyle} />
                </div>
              ))}
            </div>
          </div>

          {/* Error / success */}
          {error && (
            <div style={css({ background: "rgba(255,77,109,0.1)", border: `1px solid ${C.danger}44`, borderRadius: 10, padding: 12, marginBottom: 12, color: C.danger, fontSize: 13 })}>
              ⚠️ {error}
            </div>
          )}
          {saved && (
            <div style={css({ background: "rgba(0,245,160,0.1)", border: `1px solid ${C.accent2}44`, borderRadius: 10, padding: 12, marginBottom: 12, color: C.accent2, fontSize: 13 })}>
              ✅ Vitals saved to Supabase successfully!
            </div>
          )}

          {/* Save button */}
          <button onClick={saveVitals} disabled={!patientId}
            style={css({
              width: "100%", padding: "13px", borderRadius: 10, border: "none",
              background: !patientId ? "rgba(59,201,232,0.3)" : C.accent,
              color: C.bg, fontWeight: 700, fontSize: 15,
              cursor: !patientId ? "not-allowed" : "pointer",
            })}>
            💾 Save All Vitals
          </button>

          {/* Note */}
          <div style={css({ marginTop: 12, fontSize: 12, color: C.muted, textAlign: "center", lineHeight: 1.6 })}>
            Camera HR uses rPPG (skin colour fluctuation detection).<br />
            For clinical use, verify with a medical-grade device.
          </div>
        </div>
      </div>
    </div>
  );
}
