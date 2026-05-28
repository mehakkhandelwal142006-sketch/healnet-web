import { useState, useRef, useEffect } from "react";
import { vitalsAPI, patientsAPI } from "../services/api";

const C = {
  bg: "#030c2c", card: "#04163c", border: "rgba(59,201,232,0.18)",
  accent: "#3BC9E8", accent2: "#00f5a0", danger: "#ff4d6d",
  warn: "#ffd166", text: "#e8f4f8", muted: "rgba(232,244,248,0.5)",
};

// ── Vital display card ────────────────────────────────────────────
function VitalCard({ icon, label, value, unit, status }) {
  const statusColor = {
    normal: C.accent2, warning: C.warn, critical: C.danger, measuring: C.accent,
  }[status] || C.muted;
  return (
    <div style={{
      background: C.card, border: `1px solid ${statusColor}44`,
      borderRadius: 14, padding: 20, textAlign: "center",
    }}>
      <div style={{ fontSize: 28, marginBottom: 8 }}>{icon}</div>
      <div style={{ fontSize: 11, color: C.muted, letterSpacing: 2, marginBottom: 6 }}>{label}</div>
      {value !== null ? (
        <>
          <div style={{ fontSize: 36, fontWeight: 800, color: statusColor }}>{value}</div>
          <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>{unit}</div>
        </>
      ) : (
        <div style={{ fontSize: 14, color: C.muted, fontStyle: "italic" }}>—</div>
      )}
    </div>
  );
}

// ── Live Pulse Waveform Canvas ────────────────────────────────────
function PulseWaveform({ signal, isActive, quality }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const W = canvas.width;
    const H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    // Background grid
    ctx.strokeStyle = "rgba(59,201,232,0.06)";
    ctx.lineWidth = 1;
    for (let x = 0; x < W; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
    for (let y = 0; y < H; y += 20) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }

    if (!signal || signal.length < 2) {
      ctx.strokeStyle = "rgba(59,201,232,0.3)";
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(0, H / 2); ctx.lineTo(W, H / 2); ctx.stroke();
      return;
    }

    const display = signal.slice(-W);
    const min = Math.min(...display);
    const max = Math.max(...display);
    const range = max - min || 1;
    const color = quality > 70 ? C.accent2 : quality > 40 ? C.warn : C.danger;

    ctx.shadowBlur = 8;
    ctx.shadowColor = color;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;
    ctx.lineJoin = "round";
    ctx.beginPath();
    display.forEach((val, i) => {
      const x = (i / (display.length - 1)) * W;
      const y = H - ((val - min) / range) * (H * 0.8) - H * 0.1;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.stroke();

    if (isActive && display.length > 1) {
      const lastVal = display[display.length - 1];
      const dotY = H - ((lastVal - min) / range) * (H * 0.8) - H * 0.1;
      ctx.beginPath();
      ctx.arc(W - 4, dotY, 5, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
    }
    ctx.shadowBlur = 0;
  }, [signal, isActive, quality]);

  return (
    <canvas ref={canvasRef} width={560} height={100} style={{
      width: "100%", height: 100, borderRadius: 8,
      background: "rgba(0,0,0,0.3)", border: `1px solid ${C.border}`,
    }} />
  );
}

// ── Signal Quality Bar ────────────────────────────────────────────
function QualityBar({ quality }) {
  const color = quality > 70 ? C.accent2 : quality > 40 ? C.warn : C.danger;
  const label = quality > 70 ? "Good Signal" : quality > 40 ? "Weak Signal" : "No Signal";
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
        <span style={{ fontSize: 11, color: C.muted }}>SIGNAL QUALITY</span>
        <span style={{ fontSize: 11, color, fontWeight: 700 }}>{label} ({Math.round(quality)}%)</span>
      </div>
      <div style={{ height: 6, background: "rgba(255,255,255,0.08)", borderRadius: 3, overflow: "hidden" }}>
        <div style={{
          width: `${quality}%`, height: "100%",
          background: `linear-gradient(90deg, ${C.danger}, ${color})`,
          borderRadius: 3, transition: "width 0.3s",
        }} />
      </div>
    </div>
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
  const rawSignal   = useRef([]);
  const MEASURE_DURATION = 30;
  const SAMPLE_RATE      = 30;

  const [patients, setPatients]         = useState([]);
  const [patientId, setPatientId]       = useState("");
  const [camActive, setCamActive]       = useState(false);
  const [measuring, setMeasuring]       = useState(false);
  const [progress, setProgress]         = useState(0);
  const [saved, setSaved]               = useState(false);
  const [error, setError]               = useState("");
  const [fingerDetected, setFingerDetected] = useState(false);
  const [signalQuality, setSignalQuality]   = useState(0);
  const [displaySignal, setDisplaySignal]   = useState([]);
  const [liveHR, setLiveHR]             = useState(null);
  const [heartRate, setHeartRate]       = useState(null);
  const [hrStatus, setHrStatus]         = useState("normal");
  const [manualVitals, setManualVitals] = useState({
    spo2: "", systolic_bp: "", diastolic_bp: "", temperature: "", blood_sugar: "",
  });

  useEffect(() => {
    patientsAPI.getAll().then(r => setPatients(r.data)).catch(() => {});
    return () => stopCamera();
  }, []);

  async function startCamera() {
    setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 320 }, height: { ideal: 240 } },
      });
      streamRef.current = stream;
      try {
        const track = stream.getVideoTracks()[0];
        await track.applyConstraints({ advanced: [{ torch: true }] });
      } catch (_) {}
      if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play(); }
      setCamActive(true);
    } catch {
      setError("Camera access denied. Please allow camera permission.");
    }
  }

  function stopCamera() {
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; }
    if (intervalRef.current) clearInterval(intervalRef.current);
    setCamActive(false); setMeasuring(false); setProgress(0);
    setFingerDetected(false); setSignalQuality(0); setDisplaySignal([]); setLiveHR(null);
    rawSignal.current = []; frameCount.current = 0;
  }

  function readFrame() {
    const video = videoRef.current, canvas = canvasRef.current;
    if (!video || !canvas) return null;
    const W = 80, H = 60;
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(video, 0, 0, W, H);
    const data = ctx.getImageData(0, 0, W, H).data;
    let r = 0, g = 0, b = 0, count = 0;
    for (let i = 0; i < data.length; i += 4) { r += data[i]; g += data[i+1]; b += data[i+2]; count++; }
    return { r: r/count, g: g/count, b: b/count };
  }

  function checkFinger({ r, g, b }) { return r > 80 && r > g * 1.5 && r > b * 1.5; }

  function computeQuality(signal) {
    if (signal.length < 10) return 0;
    const recent = signal.slice(-SAMPLE_RATE * 3);
    const mean = recent.reduce((a, b) => a + b, 0) / recent.length;
    const std = Math.sqrt(recent.reduce((s, v) => s + (v - mean) ** 2, 0) / recent.length);
    const snr = (std / (mean || 1)) * 100;
    if (snr < 0.05) return 10;
    if (snr > 5) return 20;
    return Math.min(100, Math.max(0, snr * 400));
  }

  function bandpassFilter(signal) {
    if (signal.length < 6) return signal;
    const filtered = [...signal];
    const hpAlpha = 0.95;
    for (let i = 1; i < filtered.length; i++)
      filtered[i] = hpAlpha * (filtered[i-1] + signal[i] - signal[i-1]);
    const lpAlpha = 0.3;
    for (let i = 1; i < filtered.length; i++)
      filtered[i] = filtered[i-1] + lpAlpha * (filtered[i] - filtered[i-1]);
    return filtered;
  }

  function estimateHR(signal) {
    if (signal.length < SAMPLE_RATE * 5) return null;
    const filtered = bandpassFilter(signal);
    const mean = filtered.reduce((a, b) => a + b, 0) / filtered.length;
    const detrended = filtered.map(v => v - mean);
    const std = Math.sqrt(detrended.reduce((s, v) => s + v*v, 0) / detrended.length);
    const normalized = detrended.map(v => v / (std || 1));
    const minGap = Math.round(SAMPLE_RATE * 0.4);
    const peaks = [];
    for (let i = 2; i < normalized.length - 2; i++) {
      if (normalized[i] > 0.3 &&
          normalized[i] > normalized[i-1] && normalized[i] > normalized[i-2] &&
          normalized[i] > normalized[i+1] && normalized[i] > normalized[i+2]) {
        if (peaks.length === 0 || i - peaks[peaks.length-1] >= minGap) peaks.push(i);
      }
    }
    if (peaks.length < 4) return null;
    const ibis = [];
    for (let i = 1; i < peaks.length; i++) ibis.push((peaks[i] - peaks[i-1]) / SAMPLE_RATE);
    const ibiMean = ibis.reduce((a, b) => a + b, 0) / ibis.length;
    const ibiStd = Math.sqrt(ibis.reduce((s, v) => s + (v - ibiMean)**2, 0) / ibis.length);
    const valid = ibis.filter(v => Math.abs(v - ibiMean) < 2 * ibiStd);
    if (valid.length < 3) return null;
    const avgIBI = valid.reduce((a, b) => a + b, 0) / valid.length;
    const bpm = Math.round(60 / avgIBI);
    return bpm >= 40 && bpm <= 180 ? bpm : null;
  }

  function startMeasurement() {
    if (!camActive) { setError("Start camera first"); return; }
    frameCount.current = 0; rawSignal.current = [];
    setMeasuring(true); setProgress(0); setHeartRate(null);
    setLiveHR(null); setSaved(false); setError(""); setDisplaySignal([]);

    intervalRef.current = setInterval(() => {
      const frame = readFrame();
      if (!frame) return;
      const finger = checkFinger(frame);
      setFingerDetected(finger);
      rawSignal.current.push(frame.r);
      const filtered = bandpassFilter(rawSignal.current);
      setDisplaySignal([...filtered.slice(-200)]);
      setSignalQuality(finger ? computeQuality(rawSignal.current) : 5);
      frameCount.current += 1;
      if (frameCount.current > SAMPLE_RATE * 10) {
        const live = estimateHR(rawSignal.current);
        if (live) setLiveHR(live);
      }
      const pct = Math.min(100, Math.round((frameCount.current / (MEASURE_DURATION * SAMPLE_RATE)) * 100));
      setProgress(pct);
      if (frameCount.current >= MEASURE_DURATION * SAMPLE_RATE) {
        clearInterval(intervalRef.current);
        setMeasuring(false); setFingerDetected(false); setSignalQuality(0);
        const hr = estimateHR(rawSignal.current);
        if (hr) {
          setHeartRate(hr);
          setHrStatus(hr > 120 || hr < 40 ? "critical" : hr > 100 || hr < 55 ? "warning" : "normal");
        } else {
          setError("Could not estimate heart rate. Make sure your fingertip fully covers the lens and hold still.");
        }
      }
    }, 1000 / SAMPLE_RATE);
  }

  async function saveVitals() {
    if (!patientId) { setError("Select a patient first"); return; }
    setError(""); setSaved(false);
    try {
      await vitalsAPI.record({
        patient_id: patientId, source: "camera",
        heart_rate:   heartRate || undefined,
        spo2:         manualVitals.spo2         ? parseFloat(manualVitals.spo2)         : undefined,
        systolic_bp:  manualVitals.systolic_bp  ? parseFloat(manualVitals.systolic_bp)  : undefined,
        diastolic_bp: manualVitals.diastolic_bp ? parseFloat(manualVitals.diastolic_bp) : undefined,
        temperature:  manualVitals.temperature  ? parseFloat(manualVitals.temperature)  : undefined,
        blood_sugar:  manualVitals.blood_sugar  ? parseFloat(manualVitals.blood_sugar)  : undefined,
      });
      setSaved(true);
    } catch (e) { setError(e.response?.data?.detail || "Failed to save vitals"); }
  }

  const inputStyle = {
    width: "100%", padding: "10px 14px", borderRadius: 8,
    background: "rgba(59,201,232,0.07)", border: `1px solid ${C.border}`,
    color: C.text, fontSize: 14, outline: "none", boxSizing: "border-box", fontFamily: "inherit",
  };
  const setMV = (k) => (e) => setManualVitals(v => ({ ...v, [k]: e.target.value }));
  const fingerColor = fingerDetected ? C.accent2 : C.danger;

  return (
    <div style={{ fontFamily: "'Segoe UI', sans-serif", color: C.text }}>
      <style>{`
        @keyframes pulse { 0%,100%{box-shadow:0 0 0 4px rgba(255,77,109,0.3)} 50%{box-shadow:0 0 0 10px rgba(255,77,109,0.05)} }
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0.4} }
      `}</style>

      <h2 style={{ margin: "0 0 4px", fontSize: 22 }}>📷 Camera Vitals</h2>
      <p style={{ color: C.muted, fontSize: 13, marginBottom: 20 }}>
        Place your <strong style={{ color: C.accent }}>fingertip over the rear camera lens</strong>. Flashlight activates automatically on mobile.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>

        {/* LEFT */}
        <div>
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, color: C.muted, marginBottom: 5, letterSpacing: 1 }}>SELECT PATIENT</div>
            <select value={patientId} onChange={e => setPatientId(e.target.value)} style={inputStyle}>
              <option value="">— Choose patient —</option>
              {patients.map(p => <option key={p.patient_id} value={p.patient_id}>{p.name} ({p.patient_id})</option>)}
            </select>
          </div>

          {/* Camera feed */}
          <div style={{
            background: "#000", borderRadius: 14, overflow: "hidden",
            border: `2px solid ${camActive ? (fingerDetected ? C.accent2 : C.accent) : C.border}`,
            marginBottom: 12, position: "relative", aspectRatio: "4/3",
            display: "flex", alignItems: "center", justifyContent: "center", transition: "border-color 0.3s",
          }}>
            <video ref={videoRef} muted playsInline
              style={{ width: "100%", height: "100%", objectFit: "cover", display: camActive ? "block" : "none" }} />
            <canvas ref={canvasRef} style={{ display: "none" }} />

            {!camActive && (
              <div style={{ textAlign: "center", color: C.muted }}>
                <div style={{ fontSize: 52, marginBottom: 8 }}>📷</div>
                <div style={{ fontSize: 14 }}>Camera off</div>
              </div>
            )}

            {camActive && (
              <div style={{
                position: "absolute", top: 10, left: 10,
                background: "rgba(3,12,44,0.85)", border: `1px solid ${fingerColor}`,
                borderRadius: 8, padding: "5px 12px", fontSize: 12, color: fingerColor,
                animation: fingerDetected ? "none" : "blink 1.5s infinite",
              }}>
                {fingerDetected ? "✅ Finger detected" : "☝️ Place finger on lens"}
              </div>
            )}

            {measuring && liveHR && (
              <div style={{
                position: "absolute", top: 10, right: 10,
                background: "rgba(255,77,109,0.15)", border: `1px solid ${C.danger}`,
                borderRadius: 8, padding: "5px 12px", color: C.danger,
                fontSize: 13, fontWeight: 800, animation: "pulse 1s infinite",
              }}>
                ❤️ {liveHR} BPM
              </div>
            )}

            {measuring && (
              <div style={{
                position: "absolute", bottom: 0, left: 0, right: 0,
                background: "rgba(3,12,44,0.8)", padding: "10px 14px",
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                  <span style={{ fontSize: 12, color: C.text }}>
                    {fingerDetected ? "Hold perfectly still..." : "☝️ Cover lens with fingertip"}
                  </span>
                  <span style={{ fontSize: 12, color: C.accent, fontWeight: 700 }}>{progress}%</span>
                </div>
                <div style={{ height: 4, background: "rgba(255,255,255,0.1)", borderRadius: 2, overflow: "hidden" }}>
                  <div style={{
                    width: `${progress}%`, height: "100%",
                    background: `linear-gradient(90deg, ${C.danger}, ${C.warn})`,
                    borderRadius: 2, transition: "width 0.1s",
                  }} />
                </div>
              </div>
            )}
          </div>

          {/* Waveform */}
          {camActive && (
            <div style={{
              background: "rgba(0,0,0,0.3)", borderRadius: 12, padding: 12,
              border: `1px solid ${C.border}`, marginBottom: 12,
            }}>
              {measuring && <QualityBar quality={signalQuality} />}
              <div style={{ fontSize: 11, color: C.muted, marginBottom: 6, letterSpacing: 1 }}>
                LIVE PULSE WAVEFORM
                {!measuring && <span style={{ color: C.muted, fontWeight: 400 }}> — start measuring to see signal</span>}
              </div>
              <PulseWaveform signal={displaySignal} isActive={measuring} quality={signalQuality} />
            </div>
          )}

          {/* Buttons */}
          <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
            {!camActive ? (
              <button onClick={startCamera} style={{
                flex: 1, padding: "11px", borderRadius: 10, border: "none",
                background: C.accent, color: C.bg, fontWeight: 700, cursor: "pointer", fontSize: 14,
              }}>📷 Start Camera</button>
            ) : (
              <button onClick={stopCamera} style={{
                flex: 1, padding: "11px", borderRadius: 10,
                border: `1px solid ${C.danger}`, background: "transparent",
                color: C.danger, fontWeight: 700, cursor: "pointer", fontSize: 14,
              }}>⏹ Stop Camera</button>
            )}
            <button onClick={startMeasurement} disabled={!camActive || measuring} style={{
              flex: 1, padding: "11px", borderRadius: 10, border: "none",
              background: !camActive || measuring ? "rgba(255,77,109,0.3)" : C.danger,
              color: "#fff", fontWeight: 700, fontSize: 14,
              cursor: !camActive || measuring ? "not-allowed" : "pointer",
            }}>
              {measuring ? `⏳ ${progress}% — Hold still` : "❤️ Measure HR"}
            </button>
          </div>

          {/* Instructions */}
          <div style={{ background: "rgba(59,201,232,0.04)", borderRadius: 10, padding: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.accent, marginBottom: 8 }}>HOW IT WORKS</div>
            {[
              ["1", "Select a patient above"],
              ["2", "Click Start Camera (uses rear camera)"],
              ["3", "Place fingertip gently over the camera lens"],
              ["4", "Wait for ✅ Finger detected badge, then click Measure HR"],
              ["5", "Hold perfectly still for 30 seconds"],
              ["6", "Watch your live pulse waveform — shows your heartbeat!"],
              ["7", "Enter other vitals manually and Save"],
            ].map(([n, t]) => (
              <div key={n} style={{ fontSize: 12, color: C.muted, marginBottom: 5, display: "flex", gap: 8 }}>
                <span style={{ color: C.accent, fontWeight: 700, minWidth: 16 }}>{n}.</span>
                <span>{t}</span>
              </div>
            ))}
            <div style={{ fontSize: 11, color: C.warn, marginTop: 10, lineHeight: 1.6 }}>
              💡 Flashlight turns on automatically on mobile for best results.<br />
              💡 Apply gentle pressure — not too hard, not too soft.
            </div>
          </div>
        </div>

        {/* RIGHT */}
        <div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
            <VitalCard icon="❤️" label="HEART RATE" value={heartRate} unit="bpm" status={measuring ? "measuring" : hrStatus} />
            <VitalCard icon="🫁" label="SPO2" value={manualVitals.spo2 || null} unit="%" status="normal" />
            <VitalCard icon="🩸" label="BLOOD PRESSURE"
              value={manualVitals.systolic_bp ? `${manualVitals.systolic_bp}/${manualVitals.diastolic_bp || "?"}` : null}
              unit="mmHg" status="normal" />
            <VitalCard icon="🌡️" label="TEMPERATURE" value={manualVitals.temperature || null} unit="°C" status="normal" />
          </div>

          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 20, marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.accent, marginBottom: 14, letterSpacing: 1 }}>
              ENTER OTHER VITALS MANUALLY
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              {[["spo2","SpO2 (%)"],["systolic_bp","Systolic BP"],["diastolic_bp","Diastolic BP"],
                ["temperature","Temperature (°C)"],["blood_sugar","Blood Sugar (mg/dL)"]].map(([k, label]) => (
                <div key={k}>
                  <div style={{ fontSize: 11, color: C.muted, marginBottom: 4 }}>{label}</div>
                  <input type="number" placeholder="—" value={manualVitals[k]} onChange={setMV(k)} style={inputStyle} />
                </div>
              ))}
            </div>
          </div>

          {error && (
            <div style={{
              background: "rgba(255,77,109,0.1)", border: `1px solid ${C.danger}44`,
              borderRadius: 10, padding: 12, marginBottom: 12, color: C.danger, fontSize: 13,
            }}>⚠️ {error}</div>
          )}
          {saved && (
            <div style={{
              background: "rgba(0,245,160,0.1)", border: `1px solid ${C.accent2}44`,
              borderRadius: 10, padding: 12, marginBottom: 12, color: C.accent2, fontSize: 13,
            }}>✅ Vitals saved successfully!</div>
          )}

          <button onClick={saveVitals} disabled={!patientId} style={{
            width: "100%", padding: "13px", borderRadius: 10, border: "none",
            background: !patientId ? "rgba(59,201,232,0.3)" : C.accent,
            color: C.bg, fontWeight: 700, fontSize: 15,
            cursor: !patientId ? "not-allowed" : "pointer",
          }}>💾 Save All Vitals</button>

          <div style={{ marginTop: 12, fontSize: 11, color: C.muted, textAlign: "center", lineHeight: 1.7 }}>
            Uses finger PPG — red channel blood flow detection via camera + flashlight.<br />
            For clinical use, always verify with a medical-grade device.
          </div>
        </div>
      </div>
    </div>
  );
}
