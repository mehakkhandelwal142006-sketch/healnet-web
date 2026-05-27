import { useState, useRef, useEffect } from "react";
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
    normal:    C.accent2,
    warning:   C.warn,
    critical:  C.danger,
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
  const redVals     = useRef([]);   // RED channel signal from finger

  const [patients, setPatients]     = useState([]);
  const [patientId, setPatientId]   = useState("");
  const [camActive, setCamActive]   = useState(false);
  const [measuring, setMeasuring]   = useState(false);
  const [progress, setProgress]     = useState(0);
  const [saved, setSaved]           = useState(false);
  const [error, setError]           = useState("");
  const [fingerDetected, setFingerDetected] = useState(false);

  const [heartRate,    setHeartRate]   = useState(null);
  const [hrStatus,     setHrStatus]    = useState("normal");
  const [manualVitals, setManualVitals] = useState({
    spo2: "", systolic_bp: "", diastolic_bp: "",
    temperature: "", blood_sugar: "",
  });

  // Load patients on mount
  useEffect(() => {
    patientsAPI.getAll().then(r => setPatients(r.data)).catch(() => {});
    return () => stopCamera();
  }, []);

  // ── Camera (rear-facing + torch for finger PPG) ───────────────
  async function startCamera() {
    setError("");
    try {
      // Prefer rear camera so user can cover lens with finger
      // Also request torch (flashlight) for better signal on mobile
      const constraints = {
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 320 },
          height: { ideal: 240 },
        },
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      // Try to enable torch (flashlight) on mobile devices
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack && typeof videoTrack.applyConstraints === "function") {
        try {
          await videoTrack.applyConstraints({ advanced: [{ torch: true }] });
        } catch (_) {
          // Torch not supported on this device — that's OK, ambient light still works
        }
      }

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
    setFingerDetected(false);
  }

  // ── Check if finger is covering the lens ─────────────────────
  // A finger covering the lens makes the whole frame very RED and dark.
  // Average red channel will be high; blue/green will be much lower.
  function isFingerOnLens(ctx, w, h) {
    const data = ctx.getImageData(0, 0, w, h).data;
    let r = 0, g = 0, b = 0, count = 0;
    for (let i = 0; i < data.length; i += 4) {
      r += data[i];
      g += data[i + 1];
      b += data[i + 2];
      count++;
    }
    r /= count; g /= count; b /= count;
    // Finger PPG: frame is very red/dark, red dominates green and blue
    return r > 60 && r > g * 1.4 && r > b * 1.4;
  }

  // ── Get average RED channel from FULL frame ───────────────────
  // (finger covers entire lens — we use full-frame average, not a small ROI)
  function getFrameRedAvg() {
    const video  = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return null;

    const W = 80, H = 60;
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(video, 0, 0, W, H);

    // Finger detection hint
    const detected = isFingerOnLens(ctx, W, H);
    setFingerDetected(detected);

    // Full-frame average RED channel
    const data = ctx.getImageData(0, 0, W, H).data;
    let r = 0;
    for (let i = 0; i < data.length; i += 4) r += data[i];
    return r / (data.length / 4);
  }

  // ── Heart Rate Estimation from finger PPG signal ──────────────
  const MEASURE_DURATION = 30;   // seconds
  const SAMPLE_RATE      = 15;   // frames/sec

  function estimateHR(signal) {
    if (signal.length < 30) return null;

    // 1. Detrend (remove DC offset + slow drift via linear regression)
    const n = signal.length;
    const xs = Array.from({ length: n }, (_, i) => i);
    const meanX = (n - 1) / 2;
    const meanY = signal.reduce((a, b) => a + b, 0) / n;
    const num = xs.reduce((s, x, i) => s + (x - meanX) * (signal[i] - meanY), 0);
    const den = xs.reduce((s, x) => s + (x - meanX) ** 2, 0);
    const slope = num / den;
    const detrended = signal.map((v, i) => v - (slope * i + (meanY - slope * meanX)));

    // 2. Moving average smooth (window = 3 frames)
    const smoothed = detrended.map((v, i, arr) => {
      const w = 3;
      const start = Math.max(0, i - Math.floor(w / 2));
      const end   = Math.min(arr.length, i + Math.ceil(w / 2));
      const slice = arr.slice(start, end);
      return slice.reduce((a, b) => a + b, 0) / slice.length;
    });

    // 3. Peak detection (local maxima above threshold)
    const std = Math.sqrt(smoothed.reduce((s, v) => s + v ** 2, 0) / smoothed.length);
    const threshold = std * 0.4;
    const minGap    = Math.round(SAMPLE_RATE * 0.4); // min 0.4s between beats (~150 BPM max)

    const peaks = [];
    for (let i = 1; i < smoothed.length - 1; i++) {
      if (
        smoothed[i] > smoothed[i - 1] &&
        smoothed[i] > smoothed[i + 1] &&
        smoothed[i] > threshold
      ) {
        if (peaks.length === 0 || i - peaks[peaks.length - 1] >= minGap) {
          peaks.push(i);
        }
      }
    }

    if (peaks.length < 3) return null;

    // 4. Compute average BPM from inter-peak intervals
    const intervals = [];
    for (let i = 1; i < peaks.length; i++) {
      intervals.push((peaks[i] - peaks[i - 1]) / SAMPLE_RATE); // seconds
    }
    const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    const bpm = Math.round(60 / avgInterval);

    // Physiologically plausible range
    if (bpm < 40 || bpm > 180) return null;
    return bpm;
  }

  // ── Start measurement ─────────────────────────────────────────
  function startMeasurement() {
    if (!camActive) { setError("Start camera first"); return; }
    frameCount.current = 0;
    redVals.current    = [];
    setMeasuring(true);
    setProgress(0);
    setHeartRate(null);
    setSaved(false);
    setError("");

    intervalRef.current = setInterval(() => {
      const red = getFrameRedAvg();
      if (red !== null) redVals.current.push(red);

      frameCount.current += 1;
      const pct = Math.min(100, Math.round(
        (frameCount.current / (MEASURE_DURATION * SAMPLE_RATE)) * 100
      ));
      setProgress(pct);

      if (frameCount.current >= MEASURE_DURATION * SAMPLE_RATE) {
        clearInterval(intervalRef.current);
        setMeasuring(false);
        setFingerDetected(false);

        const hr = estimateHR(redVals.current);
        if (hr) {
          setHeartRate(hr);
          setHrStatus(
            hr > 120 || hr < 40 ? "critical" :
            hr > 100 || hr < 55 ? "warning"  : "normal"
          );
        } else {
          setError(
            "Could not estimate heart rate. Make sure your fingertip fully covers the camera lens and hold still."
          );
        }
      }
    }, 1000 / SAMPLE_RATE);
  }

  // ── Save all vitals ───────────────────────────────────────────
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
        @keyframes pulse {
          0%,100% { box-shadow: 0 0 0 4px rgba(255,77,109,0.3); }
          50%      { box-shadow: 0 0 0 8px rgba(255,77,109,0.1); }
        }
        @keyframes fingerPulse {
          0%,100% { opacity: 1; }
          50%      { opacity: 0.5; }
        }
      `}</style>

      <h2 style={css({ margin: "0 0 6px", fontSize: 22 })}>📷 Camera Vitals</h2>
      <p style={css({ color: C.muted, fontSize: 14, marginBottom: 24 })}>
        Measure heart rate by placing your <strong style={{ color: C.accent }}>fingertip over the camera lens</strong>.
        The flashlight will activate automatically on mobile devices.
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
            border: `1px solid ${camActive ? (fingerDetected ? C.accent2 : C.accent) : C.border}`,
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

            {/* Finger detection badge */}
            {camActive && !measuring && (
              <div style={css({
                position: "absolute", top: 10, left: 10,
                background: fingerDetected ? `${C.accent2}22` : "rgba(0,0,0,0.5)",
                border: `1px solid ${fingerDetected ? C.accent2 : C.muted}`,
                borderRadius: 8, padding: "4px 10px", fontSize: 12,
                color: fingerDetected ? C.accent2 : C.muted,
                animation: fingerDetected ? "fingerPulse 1.5s infinite" : "none",
              })}>
                {fingerDetected ? "✅ Finger detected" : "☝️ Place finger on lens"}
              </div>
            )}

            {/* Measuring overlay */}
            {measuring && (
              <div style={css({
                position: "absolute", inset: 0,
                background: "rgba(3,12,44,0.8)",
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
                  {fingerDetected
                    ? "✅ Finger detected — hold still!"
                    : "☝️ Cover the camera lens with your fingertip"}
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
              "2. Click Start Camera (uses rear camera)",
              "3. Place your fingertip gently over the camera lens",
              "4. Click Measure HR — hold still for 30 seconds",
              "5. Enter any other vitals manually below",
              "6. Click Save Vitals",
            ].map((t, i) => (
              <div key={i} style={css({ fontSize: 13, color: C.muted, marginBottom: 4 })}>{t}</div>
            ))}
            <div style={css({ fontSize: 12, color: C.warn, marginTop: 10 })}>
              💡 On mobile, the flashlight activates automatically for a better signal.
            </div>
          </div>
        </div>

        {/* ── RIGHT: Vitals display + manual entry ─────────────── */}
        <div>
          {/* Vital cards */}
          <div style={css({ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 })}>
            <VitalCard icon="❤️" label="HEART RATE" value={heartRate} unit="bpm" status={measuring ? "measuring" : hrStatus} />
            <VitalCard icon="🫁" label="SPO2"        value={manualVitals.spo2 || null} unit="%" status="normal" />
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
            Camera HR uses finger PPG (red channel blood flow detection).<br />
            For clinical use, verify with a medical-grade device.
          </div>
        </div>
      </div>
    </div>
  );
}
