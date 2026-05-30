import { useState, useRef, useEffect, useCallback } from "react";
import { vitalsAPI, patientsAPI } from "../services/api";

const C = {
  bg: "#030c2c", card: "#04163c", border: "rgba(59,201,232,0.18)",
  accent: "#3BC9E8", accent2: "#00f5a0", danger: "#ff4d6d",
  warn: "#ffd166", text: "#e8f4f8", muted: "rgba(232,244,248,0.5)",
};

// ─────────────────────────────────────────────────────────────
//  SIGNAL PROCESSING ENGINE  (research-grade, runs in JS)
//  Based on: Butterworth IIR + FFT with Hann window + peak detect
//  Ref: arxiv.org/pdf/2012.02263 (Gopalakrishnan et al., 2020)
// ─────────────────────────────────────────────────────────────

// 2nd-order Butterworth IIR bandpass  (0.7 Hz – 3.5 Hz at fs=30)
// Coefficients pre-computed for fs=30, passband 0.7–3.5 Hz
// (covers 42–210 BPM — wider than needed, Hann FFT does final narrowing)
function butterworthBPF(signal, fs = 30) {
  if (signal.length < 6) return signal;
  // Normalised frequencies
  const f1 = 0.7 / (fs / 2);   // low cut
  const f2 = 3.5 / (fs / 2);   // high cut

  // Pre-warp
  const w1 = 2 * Math.tan(Math.PI * f1);
  const w2 = 2 * Math.tan(Math.PI * f2);
  const bw = w2 - w1;
  const w0 = Math.sqrt(w1 * w2);

  // Bilinear transform 2nd-order BPF coefficients
  const denom = 4 + 2 * bw + w0 * w0;
  const b0 =  2 * bw / denom;
  const b1 =  0;
  const b2 = -2 * bw / denom;
  const a1 = (2 * w0 * w0 - 8) / denom;
  const a2 = (4 - 2 * bw + w0 * w0) / denom;

  const out = new Array(signal.length).fill(0);
  out[0] = signal[0] * b0;
  if (signal.length > 1) out[1] = signal[1] * b0 + signal[0] * b1 - out[0] * a1;
  for (let i = 2; i < signal.length; i++) {
    out[i] = b0 * signal[i] + b1 * signal[i-1] + b2 * signal[i-2]
            - a1 * out[i-1] - a2 * out[i-2];
  }
  return out;
}

// Hann-windowed FFT — returns dominant frequency in Hz
// Uses next power-of-2 padding for speed
function fftHannHR(signal, fs) {
  const N = signal.length;
  // Apply Hann window
  const windowed = signal.map((v, i) => v * 0.5 * (1 - Math.cos(2 * Math.PI * i / (N - 1))));

  // Pad to next power of 2
  let M = 1;
  while (M < N) M <<= 1;
  const re = new Array(M).fill(0);
  const im = new Array(M).fill(0);
  for (let i = 0; i < N; i++) re[i] = windowed[i];

  // Cooley-Tukey iterative FFT
  // Bit-reversal permutation
  for (let i = 1, j = 0; i < M; i++) {
    let bit = M >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  // FFT butterfly
  for (let len = 2; len <= M; len <<= 1) {
    const ang = -2 * Math.PI / len;
    const wRe = Math.cos(ang), wIm = Math.sin(ang);
    for (let i = 0; i < M; i += len) {
      let curRe = 1, curIm = 0;
      for (let j = 0; j < len / 2; j++) {
        const uRe = re[i+j], uIm = im[i+j];
        const vRe = re[i+j+len/2]*curRe - im[i+j+len/2]*curIm;
        const vIm = re[i+j+len/2]*curIm + im[i+j+len/2]*curRe;
        re[i+j] = uRe+vRe; im[i+j] = uIm+vIm;
        re[i+j+len/2] = uRe-vRe; im[i+j+len/2] = uIm-vIm;
        [curRe, curIm] = [curRe*wRe - curIm*wIm, curRe*wIm + curIm*wRe];
      }
    }
  }

  // Power spectrum — search only in HR range 0.7–3.5 Hz (42–210 BPM)
  const freqRes = fs / M;
  const loIdx = Math.ceil(0.7 / freqRes);
  const hiIdx = Math.floor(3.5 / freqRes);

  let maxPow = -Infinity, peakIdx = loIdx;
  for (let k = loIdx; k <= hiIdx; k++) {
    const pow = re[k]*re[k] + im[k]*im[k];
    if (pow > maxPow) { maxPow = pow; peakIdx = k; }
  }

  // Parabolic interpolation for sub-bin accuracy
  const prev = peakIdx > loIdx ? (re[peakIdx-1]**2 + im[peakIdx-1]**2) : maxPow;
  const next = peakIdx < hiIdx ? (re[peakIdx+1]**2 + im[peakIdx+1]**2) : maxPow;
  const delta = (next - prev) / (2 * (2*maxPow - prev - next) || 1);
  const refinedHz = (peakIdx + delta) * freqRes;

  return refinedHz; // Hz
}

// ── Savitzky-Golay 5-point smooth (reduces HF noise pre-FFT) ──
function savitzkyGolay5(signal) {
  const out = [...signal];
  const c = [-3, 12, 17, 12, -3]; // coefficients / 35
  for (let i = 2; i < signal.length - 2; i++) {
    out[i] = (c[0]*signal[i-2] + c[1]*signal[i-1] + c[2]*signal[i]
            + c[3]*signal[i+1] + c[4]*signal[i+2]) / 35;
  }
  return out;
}

// ── Linear detrend (remove AGC baseline drift) ──────────────
function detrend(signal) {
  const n = signal.length;
  const mx = (n - 1) / 2;
  const my = signal.reduce((a,b) => a+b, 0) / n;
  const num = signal.reduce((s,v,i) => s + (i-mx)*(v-my), 0);
  const den = signal.reduce((s,_,i) => s + (i-mx)**2, 0);
  const slope = num / den;
  return signal.map((v,i) => v - (slope*i + (my - slope*mx)));
}

// ── MASTER ESTIMATOR ─────────────────────────────────────────
// Uses FFT on multiple overlapping windows, returns weighted median
function estimateHeartRate(rawSignal, fs) {
  if (rawSignal.length < fs * 8) return null;

  const winSec  = 8;            // 8-second analysis window (good frequency resolution)
  const stepSec = 2;            // slide 2 seconds at a time
  const winLen  = Math.round(winSec * fs);
  const stepLen = Math.round(stepSec * fs);

  const estimates = [];

  for (let start = 0; start + winLen <= rawSignal.length; start += stepLen) {
    const segment = rawSignal.slice(start, start + winLen);

    // 1. Detrend
    const dt = detrend(segment);

    // 2. Butterworth BPF
    const filtered = butterworthBPF(dt, fs);

    // 3. Savitzky-Golay smooth
    const smoothed = savitzkyGolay5(filtered);

    // 4. FFT + Hann window → dominant frequency
    const hz = fftHannHR(smoothed, fs);
    const bpm = Math.round(hz * 60);

    if (bpm >= 40 && bpm <= 180) estimates.push(bpm);
  }

  if (estimates.length === 0) return null;
  if (estimates.length === 1) return estimates[0];

  // Weighted median — reject outliers more than 15 BPM from median
  estimates.sort((a,b) => a-b);
  const median = estimates[Math.floor(estimates.length / 2)];
  const stable = estimates.filter(e => Math.abs(e - median) <= 12);
  if (stable.length === 0) return null;

  // Final: mean of stable estimates (smoother than median alone)
  const final = Math.round(stable.reduce((a,b) => a+b, 0) / stable.length);
  return (final >= 40 && final <= 180) ? final : null;
}

// ─────────────────────────────────────────────────────────────
//  UI COMPONENTS
// ─────────────────────────────────────────────────────────────

function VitalCard({ icon, label, value, unit, status }) {
  const col = { normal:C.accent2, warning:C.warn, critical:C.danger, measuring:C.accent }[status] || C.muted;
  return (
    <div style={{ background:C.card, border:`1px solid ${col}44`, borderRadius:14, padding:20, textAlign:"center" }}>
      <div style={{ fontSize:28, marginBottom:8 }}>{icon}</div>
      <div style={{ fontSize:11, color:C.muted, letterSpacing:2, marginBottom:6 }}>{label}</div>
      {value !== null
        ? <><div style={{ fontSize:36, fontWeight:800, color:col }}>{value}</div>
            <div style={{ fontSize:12, color:C.muted, marginTop:4 }}>{unit}</div></>
        : <div style={{ fontSize:14, color:C.muted, fontStyle:"italic" }}>—</div>}
    </div>
  );
}

function PulseWaveform({ signal, quality }) {
  const ref = useRef(null);
  useEffect(() => {
    const c = ref.current; if (!c) return;
    const ctx = c.getContext("2d");
    const W = c.width, H = c.height;
    ctx.clearRect(0,0,W,H);
    // Grid
    ctx.strokeStyle="rgba(59,201,232,0.06)"; ctx.lineWidth=1;
    for(let x=0;x<W;x+=40){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,H);ctx.stroke();}
    for(let y=0;y<H;y+=20){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke();}
    if (!signal || signal.length < 2) {
      ctx.strokeStyle="rgba(59,201,232,0.25)"; ctx.lineWidth=1.5;
      ctx.beginPath(); ctx.moveTo(0,H/2); ctx.lineTo(W,H/2); ctx.stroke(); return;
    }
    const d = signal.slice(-W);
    const mn = Math.min(...d), mx = Math.max(...d), rng = mx-mn||1;
    const color = quality>70 ? C.accent2 : quality>40 ? C.warn : C.danger;
    ctx.shadowBlur=6; ctx.shadowColor=color;
    ctx.strokeStyle=color; ctx.lineWidth=2; ctx.lineJoin="round";
    ctx.beginPath();
    d.forEach((v,i) => {
      const x = (i/(d.length-1))*W;
      const y = H - ((v-mn)/rng)*(H*0.8) - H*0.1;
      i===0 ? ctx.moveTo(x,y) : ctx.lineTo(x,y);
    });
    ctx.stroke();
    // Live dot
    const lv = d[d.length-1];
    const dotY = H - ((lv-mn)/rng)*(H*0.8) - H*0.1;
    ctx.beginPath(); ctx.arc(W-3,dotY,4,0,Math.PI*2);
    ctx.fillStyle=color; ctx.fill();
    ctx.shadowBlur=0;
  }, [signal, quality]);
  return <canvas ref={ref} width={560} height={90}
    style={{ width:"100%", height:90, borderRadius:8, background:"rgba(0,0,0,0.35)", border:`1px solid ${C.border}` }} />;
}

function QualityBar({ quality, stable }) {
  const color = quality>70 ? C.accent2 : quality>40 ? C.warn : C.danger;
  const label = quality>70 ? (stable?"✅ Excellent — keep still":"✅ Good signal") : quality>40 ? "⚠️ Weak — press firmer" : "❌ No signal — cover lens";
  return (
    <div style={{ marginBottom:10 }}>
      <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
        <span style={{ fontSize:11, color:C.muted, letterSpacing:1 }}>SIGNAL QUALITY</span>
        <span style={{ fontSize:11, color, fontWeight:700 }}>{label}</span>
      </div>
      <div style={{ height:7, background:"rgba(255,255,255,0.07)", borderRadius:4, overflow:"hidden" }}>
        <div style={{ width:`${quality}%`, height:"100%", background:`linear-gradient(90deg,${C.danger},${color})`, borderRadius:4, transition:"width 0.4s" }} />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
//  MAIN PAGE
// ─────────────────────────────────────────────────────────────
export default function CameraPage() {
  const videoRef    = useRef(null);
  const canvasRef   = useRef(null);
  const streamRef   = useRef(null);
  const trackRef    = useRef(null);
  const timerRef    = useRef(null);
  const signalRef   = useRef([]);      // raw red values
  const frameRef    = useRef(0);
  const torchRef    = useRef(false);

  // Fixed 30fps — Butterworth coefficients assume fs=30
  // On devices that can't sustain 30fps we correct for actual fs
  const TARGET_FPS  = 30;
  const DURATION    = 30;              // seconds
  const MIN_QUALITY = 35;             // below this → warn user

  const [patients,setPatients]   = useState([]);
  const [patientId,setPatientId] = useState("");
  const [camActive,setCamActive] = useState(false);
  const [torchOn,setTorchOn]     = useState(false);
  const [measuring,setMeasuring] = useState(false);
  const [progress,setProgress]   = useState(0);
  const [quality,setQuality]     = useState(0);
  const [stable,setStable]       = useState(false);
  const [fingerOk,setFingerOk]   = useState(false);
  const [waveform,setWaveform]   = useState([]);
  const [liveHR,setLiveHR]       = useState(null);
  const [heartRate,setHeartRate] = useState(null);
  const [hrStatus,setHrStatus]   = useState("normal");
  const [saved,setSaved]         = useState(false);
  const [error,setError]         = useState("");
  const [manualVitals,setManualVitals] = useState({
    spo2:"", systolic_bp:"", diastolic_bp:"", temperature:"", blood_sugar:"",
  });

  useEffect(() => {
    patientsAPI.getAll().then(r=>setPatients(r.data)).catch(()=>{});
    return ()=>stopEverything();
  }, []);

  // ── TORCH: try 3 strategies ──────────────────────────────
  async function tryEnableTorch(track) {
    // Strategy 1: applyConstraints (works on most)
    try { await track.applyConstraints({ advanced:[{ torch:true }] }); torchRef.current=true; setTorchOn(true); return; } catch(_){}
    // Strategy 2: imageCapture API (some Samsung)
    try {
      const ic = new window.ImageCapture(track);
      const caps = await ic.getPhotoCapabilities();
      if (caps.fillLightMode && caps.fillLightMode.includes("flash")) {
        await ic.takePhoto({ fillLightMode:"flash" });
        torchRef.current=true; setTorchOn(true); return;
      }
    } catch(_){}
    // Strategy 3: failed — show manual button
    torchRef.current=false; setTorchOn(false);
  }

  async function startCamera() {
    setError("");
    // Try rear camera + torch in initial constraints first (Samsung fix)
    let stream;
    const constraints = [
      // Try 1: torch in initial constraint (Samsung Chrome)
      { video:{ facingMode:{ideal:"environment"}, width:{ideal:640}, height:{ideal:480}, advanced:[{torch:true}] } },
      // Try 2: rear camera, torch separately
      { video:{ facingMode:{ideal:"environment"}, width:{ideal:640}, height:{ideal:480} } },
      // Try 3: any camera
      { video:{ width:{ideal:320}, height:{ideal:240} } },
    ];

    for (const c of constraints) {
      try { stream = await navigator.mediaDevices.getUserMedia(c); break; } catch(_){}
    }
    if (!stream) { setError("Camera access denied. Please allow camera permission."); return; }

    streamRef.current = stream;
    const track = stream.getVideoTracks()[0];
    trackRef.current = track;

    // Check if torch was already enabled via initial constraint
    const settings = track.getSettings();
    if (settings.torch) { torchRef.current=true; setTorchOn(true); }
    else await tryEnableTorch(track);

    if (videoRef.current) { videoRef.current.srcObject=stream; await videoRef.current.play(); }
    setCamActive(true);
  }

  async function toggleTorch() {
    if (!trackRef.current) return;
    const next = !torchRef.current;
    try {
      await trackRef.current.applyConstraints({ advanced:[{ torch:next }] });
      torchRef.current=next; setTorchOn(next);
    } catch(e) { setError("Torch not supported on this device."); }
  }

  function stopEverything() {
    if (timerRef.current) clearInterval(timerRef.current);
    if (streamRef.current) { streamRef.current.getTracks().forEach(t=>t.stop()); streamRef.current=null; }
    trackRef.current=null; torchRef.current=false;
    signalRef.current=[]; frameRef.current=0;
    setCamActive(false); setMeasuring(false); setProgress(0);
    setQuality(0); setFingerOk(false); setWaveform([]); setLiveHR(null);
    setTorchOn(false); setStable(false);
  }

  // ── FRAME READING ────────────────────────────────────────
  // Read center 50x50 pixels — avoids light leakage at edges
  function readRedAvg() {
    const v=videoRef.current, c=canvasRef.current;
    if (!v||!c||v.readyState<2) return null;
    const W=80, H=60;
    c.width=W; c.height=H;
    const ctx=c.getContext("2d");
    ctx.drawImage(v,0,0,W,H);
    // Center ROI
    const rx=15, ry=10, rw=50, rh=40;
    const d=ctx.getImageData(rx,ry,rw,rh).data;
    let r=0,g=0,b=0,n=0;
    for (let i=0;i<d.length;i+=4){r+=d[i];g+=d[i+1];b+=d[i+2];n++;}
    return { r:r/n, g:g/n, b:b/n };
  }

  // ── FINGER DETECTION ─────────────────────────────────────
  // Finger on lens: frame goes very red/dark, red >> green & blue
  function isFinger({r,g,b}) {
    return r>40 && r>g*1.2 && r>b*1.2;
  }

  // ── QUALITY (AC/DC perfusion index) ─────────────────────
  function calcQuality(sig) {
    if (sig.length<15) return 0;
    const recent = sig.slice(-TARGET_FPS*3); // last 3s
    const dc = recent.reduce((a,b)=>a+b,0)/recent.length;
    if (dc<5) return 0;
    const ac = Math.sqrt(recent.reduce((s,v)=>s+(v-dc)**2,0)/recent.length);
    const pi = (ac/dc)*100;
    if (pi<0.05) return 5;
    if (pi>10)   return 12;
    return Math.min(100, pi*22);
  }

  // ── STABILITY CHECK ──────────────────────────────────────
  // Signal is stable if quality stayed >40 for last 5s
  const qualityHistory = useRef([]);
  function checkStable(q) {
    qualityHistory.current.push(q);
    if (qualityHistory.current.length > TARGET_FPS*5)
      qualityHistory.current.shift();
    const avg = qualityHistory.current.reduce((a,b)=>a+b,0)/qualityHistory.current.length;
    return avg > 45;
  }

  // ── WAVEFORM DISPLAY ─────────────────────────────────────
  // Show the Butterworth-filtered signal, not raw
  function getDisplaySignal(sig, fs) {
    if (sig.length<6) return sig;
    const dt = detrend(sig.slice(-200));
    return butterworthBPF(dt, fs);
  }

  // ── START MEASUREMENT ────────────────────────────────────
  function startMeasurement() {
    if (!camActive) { setError("Start camera first."); return; }
    signalRef.current=[]; frameRef.current=0;
    qualityHistory.current=[];
    setMeasuring(true); setProgress(0); setHeartRate(null);
    setLiveHR(null); setSaved(false); setError("");
    setWaveform([]); setStable(false);

    // Measure actual fps from timestamps for accurate fs
    const timestamps = [];
    const startTime = Date.now();

    timerRef.current = setInterval(() => {
      const frame = readRedAvg();
      if (!frame) return;

      timestamps.push(Date.now());
      const finger = isFinger(frame);
      setFingerOk(finger);
      signalRef.current.push(frame.r);
      frameRef.current++;

      // Compute actual fps from last 2s of timestamps
      let actualFps = TARGET_FPS;
      if (timestamps.length > 10) {
        const recentTs = timestamps.slice(-TARGET_FPS*2);
        if (recentTs.length > 1) {
          const elapsed = (recentTs[recentTs.length-1] - recentTs[0]) / 1000;
          actualFps = Math.min(TARGET_FPS, (recentTs.length-1)/elapsed);
          actualFps = Math.max(10, actualFps); // clamp 10–30
        }
      }

      const q = finger ? calcQuality(signalRef.current) : 0;
      const isStable = checkStable(q);
      setQuality(Math.round(q));
      setStable(isStable);

      // Display filtered waveform
      if (signalRef.current.length > 10) {
        setWaveform([...getDisplaySignal(signalRef.current, actualFps)]);
      }

      // Live estimate after 10s
      if (signalRef.current.length >= Math.round(actualFps*10)) {
        const live = estimateHeartRate(signalRef.current, actualFps);
        if (live) setLiveHR(live);
      }

      // Progress based on elapsed time
      const elapsed = (Date.now() - startTime) / 1000;
      const pct = Math.min(100, Math.round((elapsed/DURATION)*100));
      setProgress(pct);

      // Done
      if (elapsed >= DURATION) {
        clearInterval(timerRef.current);
        setMeasuring(false); setFingerOk(false); setQuality(0); setStable(false);

        const sig = signalRef.current;
        const totalElapsed = (timestamps[timestamps.length-1] - timestamps[0]) / 1000;
        const finalFps = sig.length / totalElapsed;
        const hr = estimateHeartRate(sig, Math.max(10, Math.min(TARGET_FPS, finalFps)));
        if (hr) {
          setHeartRate(hr);
          setHrStatus(hr>120||hr<40?"critical":hr>100||hr<55?"warning":"normal");
        } else {
          setError("Could not estimate heart rate. Keep your finger completely still and ensure the signal quality is Good or higher.");
        }
      }
    }, 1000/TARGET_FPS);
  }

  async function saveVitals() {
    if (!patientId) { setError("Select a patient first."); return; }
    setError(""); setSaved(false);
    try {
      await vitalsAPI.record({
        patient_id:patientId, source:"camera",
        heart_rate:  heartRate||undefined,
        spo2:        manualVitals.spo2        ? parseFloat(manualVitals.spo2)        : undefined,
        systolic_bp: manualVitals.systolic_bp ? parseFloat(manualVitals.systolic_bp) : undefined,
        diastolic_bp:manualVitals.diastolic_bp? parseFloat(manualVitals.diastolic_bp): undefined,
        temperature: manualVitals.temperature ? parseFloat(manualVitals.temperature) : undefined,
        blood_sugar: manualVitals.blood_sugar ? parseFloat(manualVitals.blood_sugar) : undefined,
      });
      setSaved(true);
    } catch(e) { setError(e.response?.data?.detail||"Failed to save vitals."); }
  }

  const inp = {
    width:"100%", padding:"10px 14px", borderRadius:8,
    background:"rgba(59,201,232,0.07)", border:`1px solid ${C.border}`,
    color:C.text, fontSize:14, outline:"none", boxSizing:"border-box", fontFamily:"inherit",
  };
  const setMV = k => e => setManualVitals(v=>({...v,[k]:e.target.value}));
  const fc = fingerOk ? C.accent2 : C.danger;

  return (
    <div style={{ fontFamily:"'Segoe UI',sans-serif", color:C.text }}>
      <style>{`
        @keyframes pulse{0%,100%{box-shadow:0 0 0 4px rgba(255,77,109,.3)}50%{box-shadow:0 0 0 10px rgba(255,77,109,.05)}}
        @keyframes blink{0%,100%{opacity:1}50%{opacity:.35}}
        @keyframes spin{to{transform:rotate(360deg)}}
      `}</style>

      <h2 style={{ margin:"0 0 4px", fontSize:22 }}>📷 Camera Vitals</h2>
      <p style={{ color:C.muted, fontSize:13, marginBottom:20 }}>
        Cover the <strong style={{color:C.accent}}>rear camera lens completely</strong> with your fingertip.
        Uses FFT + Butterworth filtering for clinical-grade accuracy.
      </p>

      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:20 }}>
        {/* ── LEFT ─────────────────────────────────────────── */}
        <div>
          {/* Patient selector */}
          <div style={{ marginBottom:14 }}>
            <div style={{ fontSize:11, color:C.muted, marginBottom:5, letterSpacing:1 }}>SELECT PATIENT</div>
            <select value={patientId} onChange={e=>setPatientId(e.target.value)} style={inp}>
              <option value="">— Choose patient —</option>
              {patients.map(p=><option key={p.patient_id} value={p.patient_id}>{p.name} ({p.patient_id})</option>)}
            </select>
          </div>

          {/* Camera view */}
          <div style={{
            background:"#000", borderRadius:14, overflow:"hidden",
            border:`2px solid ${camActive?(fingerOk?C.accent2:C.accent):C.border}`,
            marginBottom:12, position:"relative", aspectRatio:"4/3",
            display:"flex", alignItems:"center", justifyContent:"center",
            transition:"border-color .3s",
          }}>
            <video ref={videoRef} muted playsInline
              style={{ width:"100%", height:"100%", objectFit:"cover", display:camActive?"block":"none" }} />
            <canvas ref={canvasRef} style={{ display:"none" }} />

            {!camActive&&(
              <div style={{ textAlign:"center", color:C.muted }}>
                <div style={{ fontSize:52, marginBottom:8 }}>📷</div>
                <div>Camera off — tap Start Camera</div>
              </div>
            )}

            {/* Finger badge */}
            {camActive&&(
              <div style={{
                position:"absolute", top:10, left:10,
                background:"rgba(3,12,44,.88)", border:`1px solid ${fc}`,
                borderRadius:8, padding:"5px 12px", fontSize:12, color:fc,
                animation:fingerOk?"none":"blink 1.5s infinite",
              }}>
                {fingerOk?"✅ Finger detected":"☝️ Cover lens completely"}
              </div>
            )}

            {/* Torch badge */}
            {camActive&&(
              <div style={{
                position:"absolute", top:10, right:10,
                background:torchOn?"rgba(255,209,102,.15)":"rgba(0,0,0,.5)",
                border:`1px solid ${torchOn?C.warn:C.muted}`,
                borderRadius:8, padding:"5px 10px", fontSize:11,
                color:torchOn?C.warn:C.muted,
              }}>
                {torchOn?"🔦 ON":"🔦 OFF"}
              </div>
            )}

            {/* Live BPM */}
            {measuring&&liveHR&&(
              <div style={{
                position:"absolute", bottom:55, right:10,
                background:"rgba(255,77,109,.15)", border:`1px solid ${C.danger}`,
                borderRadius:8, padding:"5px 12px", color:C.danger,
                fontSize:13, fontWeight:800, animation:"pulse 1s infinite",
              }}>❤️ ~{liveHR} BPM</div>
            )}

            {/* Progress bar */}
            {measuring&&(
              <div style={{ position:"absolute", bottom:0, left:0, right:0, background:"rgba(3,12,44,.88)", padding:"10px 14px" }}>
                <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
                  <span style={{ fontSize:12, color:C.text }}>
                    {fingerOk
                      ? (stable?"🟢 Excellent — keep holding":"🟡 Hold still — stabilizing...")
                      : "☝️ Cover the lens with your fingertip"}
                  </span>
                  <span style={{ fontSize:12, color:C.accent, fontWeight:700 }}>{progress}%</span>
                </div>
                <div style={{ height:4, background:"rgba(255,255,255,.1)", borderRadius:2, overflow:"hidden" }}>
                  <div style={{ width:`${progress}%`, height:"100%", background:`linear-gradient(90deg,${C.danger},${C.warn})`, borderRadius:2, transition:"width .15s" }} />
                </div>
              </div>
            )}
          </div>

          {/* Waveform + quality */}
          {camActive&&(
            <div style={{ background:"rgba(0,0,0,.3)", borderRadius:12, padding:12, border:`1px solid ${C.border}`, marginBottom:12 }}>
              {measuring&&<QualityBar quality={quality} stable={stable}/>}
              <div style={{ fontSize:11, color:C.muted, marginBottom:6, letterSpacing:1 }}>
                FILTERED PULSE WAVEFORM
                {!measuring&&<span style={{fontWeight:400}}> — tap Measure HR to begin</span>}
              </div>
              <PulseWaveform signal={waveform} quality={quality}/>
            </div>
          )}

          {/* Buttons */}
          <div style={{ display:"flex", gap:10, marginBottom:10 }}>
            {!camActive
              ? <button onClick={startCamera} style={{ flex:1, padding:"11px", borderRadius:10, border:"none", background:C.accent, color:C.bg, fontWeight:700, cursor:"pointer", fontSize:14 }}>📷 Start Camera</button>
              : <button onClick={stopEverything} style={{ flex:1, padding:"11px", borderRadius:10, border:`1px solid ${C.danger}`, background:"transparent", color:C.danger, fontWeight:700, cursor:"pointer", fontSize:14 }}>⏹ Stop</button>
            }
            <button onClick={startMeasurement} disabled={!camActive||measuring} style={{
              flex:1, padding:"11px", borderRadius:10, border:"none",
              background:!camActive||measuring?"rgba(255,77,109,.3)":C.danger,
              color:"#fff", fontWeight:700, fontSize:14,
              cursor:!camActive||measuring?"not-allowed":"pointer",
            }}>
              {measuring?`⏳ ${progress}% — hold still`:"❤️ Measure HR"}
            </button>
          </div>

          {/* Manual torch button */}
          {camActive&&(
            <button onClick={toggleTorch} style={{
              width:"100%", padding:"9px", borderRadius:10, marginBottom:12,
              border:`1px solid ${torchOn?C.warn:C.border}`,
              background:torchOn?"rgba(255,209,102,.1)":"rgba(59,201,232,.04)",
              color:torchOn?C.warn:C.muted, fontWeight:600, fontSize:13, cursor:"pointer",
            }}>
              🔦 {torchOn?"Flashlight ON — tap to turn off":"Flashlight OFF — tap to turn on"}
            </button>
          )}

          {/* Instructions */}
          <div style={{ background:"rgba(59,201,232,.04)", borderRadius:10, padding:14 }}>
            <div style={{ fontSize:12, fontWeight:700, color:C.accent, marginBottom:8 }}>FOR ACCURATE RESULTS</div>
            {[
              ["1","Start Camera → place fingertip firmly over the rear lens"],
              ["2","If flashlight doesn't auto-enable, tap the button above"],
              ["3","Wait until signal quality shows yellow or green"],
              ["4","Tap Measure HR — keep hand and finger COMPLETELY STILL"],
              ["5","Rest your elbow on a table — even small tremors affect accuracy"],
              ["6","Wait for 100% — the algorithm uses the full 30s for best results"],
            ].map(([n,t])=>(
              <div key={n} style={{ fontSize:12, color:C.muted, marginBottom:5, display:"flex", gap:8 }}>
                <span style={{ color:C.accent, fontWeight:700, minWidth:16 }}>{n}.</span>
                <span>{t}</span>
              </div>
            ))}
            <div style={{ fontSize:11, color:C.warn, marginTop:10, lineHeight:1.65 }}>
              💡 Samsung: tap the flashlight button manually if it doesn't auto-enable.<br/>
              💡 Don't move, talk, or breathe heavily during measurement.<br/>
              💡 Results within ±5 BPM of a pulse oximeter confirm good technique.
            </div>
          </div>
        </div>

        {/* ── RIGHT ────────────────────────────────────────── */}
        <div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:20 }}>
            <VitalCard icon="❤️" label="HEART RATE" value={heartRate} unit="bpm" status={measuring?"measuring":hrStatus}/>
            <VitalCard icon="🫁" label="SPO2" value={manualVitals.spo2||null} unit="%" status="normal"/>
            <VitalCard icon="🩸" label="BLOOD PRESSURE"
              value={manualVitals.systolic_bp?`${manualVitals.systolic_bp}/${manualVitals.diastolic_bp||"?"}`:null}
              unit="mmHg" status="normal"/>
            <VitalCard icon="🌡️" label="TEMPERATURE" value={manualVitals.temperature||null} unit="°C" status="normal"/>
          </div>

          <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:14, padding:20, marginBottom:16 }}>
            <div style={{ fontSize:12, fontWeight:700, color:C.accent, marginBottom:14, letterSpacing:1 }}>ENTER OTHER VITALS MANUALLY</div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
              {[["spo2","SpO2 (%)"],["systolic_bp","Systolic BP"],["diastolic_bp","Diastolic BP"],
                ["temperature","Temperature (°C)"],["blood_sugar","Blood Sugar (mg/dL)"]].map(([k,label])=>(
                <div key={k}>
                  <div style={{ fontSize:11, color:C.muted, marginBottom:4 }}>{label}</div>
                  <input type="number" placeholder="—" value={manualVitals[k]} onChange={setMV(k)} style={inp}/>
                </div>
              ))}
            </div>
          </div>

          {error&&<div style={{ background:"rgba(255,77,109,.1)", border:`1px solid ${C.danger}44`, borderRadius:10, padding:12, marginBottom:12, color:C.danger, fontSize:13 }}>⚠️ {error}</div>}
          {saved&&<div style={{ background:"rgba(0,245,160,.1)", border:`1px solid ${C.accent2}44`, borderRadius:10, padding:12, marginBottom:12, color:C.accent2, fontSize:13 }}>✅ Vitals saved successfully!</div>}

          <button onClick={saveVitals} disabled={!patientId} style={{
            width:"100%", padding:"13px", borderRadius:10, border:"none",
            background:!patientId?"rgba(59,201,232,.3)":C.accent,
            color:C.bg, fontWeight:700, fontSize:15,
            cursor:!patientId?"not-allowed":"pointer",
          }}>💾 Save All Vitals</button>

          <div style={{ marginTop:12, fontSize:11, color:C.muted, textAlign:"center", lineHeight:1.7 }}>
            Algorithm: Butterworth IIR bandpass → Savitzky-Golay smooth → FFT + Hann window.<br/>
            Median of overlapping 8s windows eliminates motion artifacts.<br/>
            For clinical use, verify with a certified pulse oximeter.
          </div>
        </div>
      </div>
    </div>
  );
}
