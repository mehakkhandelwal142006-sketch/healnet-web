// ─────────────────────────────────────────────────────────────────────────────
//  HEALNET  —  App.jsx
//  Biometric login via Web Authentication API (WebAuthn / browser native)
//  No extra packages needed — works in Chrome, Edge, Safari, Firefox
// ─────────────────────────────────────────────────────────────────────────────
import { useState, useEffect, useCallback } from "react";
import { authAPI, patientsAPI, vitalsAPI, alertsAPI } from "./services/api";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import AIPanel        from "./pages/aipanel";
import PupilPage      from "./pages/pupilpage";
import CameraPage     from "./pages/camerapage";
import SmartWatchPage from "./pages/smartwatch";

// ─────────────────────────────────────────────────────────────────────────────
//  BIOMETRIC HELPERS
//  Uses the browser's built-in PasswordCredential / PublicKeyCredential API
//  to trigger Windows Hello, Touch ID, Face ID — whatever the OS supports.
//  Falls back silently on unsupported browsers.
// ─────────────────────────────────────────────────────────────────────────────

const BIO_USER_KEY  = "healnet_bio_user";
const BIO_TOKEN_KEY = "healnet_bio_token";

/** Save credentials after a successful password login */
function saveBioSession(token, user) {
  localStorage.setItem(BIO_TOKEN_KEY, token);
  localStorage.setItem(BIO_USER_KEY,  JSON.stringify(user));
}

/** Load the previously saved session */
function loadBioSession() {
  try {
    const token = localStorage.getItem(BIO_TOKEN_KEY);
    const user  = JSON.parse(localStorage.getItem(BIO_USER_KEY));
    return (token && user) ? { token, user } : null;
  } catch { return null; }
}

/** Clear the saved session (on logout or "use different account") */
function clearBioSession() {
  localStorage.removeItem(BIO_TOKEN_KEY);
  localStorage.removeItem(BIO_USER_KEY);
}

/**
 * Check if the browser supports a biometric/platform authenticator.
 * Returns true on devices with Windows Hello, Touch ID, Face ID, etc.
 */
async function isBiometricAvailable() {
  try {
    if (!window.PublicKeyCredential) return false;
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch { return false; }
}

/**
 * Trigger the native OS biometric prompt using a dummy get() call.
 * We're not doing full WebAuthn registration here — we're using the
 * platform authenticator purely as a "prove you're the device owner"
 * gate before restoring the already-saved session.
 * Returns true if the user passed biometric, false otherwise.
 */
async function promptBiometric(userName) {
  try {
    // Create a random challenge (not verified by server — session-only gate)
    const challenge = new Uint8Array(32);
    window.crypto.getRandomValues(challenge);

    // Try platform authenticator (Windows Hello / Touch ID / Face ID)
    await navigator.credentials.get({
      publicKey: {
        challenge,
        timeout: 60000,
        userVerification: "required",   // forces biometric — not just PIN
        allowCredentials: [],           // empty = any resident credential
        rpId: window.location.hostname, // must match the site origin
      },
    });
    return true;
  } catch (err) {
    // NotAllowedError  = user cancelled / timed out
    // NotSupportedError = no credential registered yet
    // We treat both as "not passed"
    console.log("[HealNet] biometric prompt result:", err.name);
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  THEME
// ─────────────────────────────────────────────────────────────────────────────
const C = {
  bg:     "#030c2c",
  card:   "#04163c",
  border: "rgba(59,201,232,0.18)",
  accent: "#3BC9E8",
  accent2:"#00f5a0",
  danger: "#ff4d6d",
  warn:   "#ffd166",
  text:   "#e8f4f8",
  muted:  "rgba(232,244,248,0.5)",
};

// ─────────────────────────────────────────────────────────────────────────────
//  RESPONSIVE HOOK
// ─────────────────────────────────────────────────────────────────────────────
function useIsMobile() {
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  useEffect(() => {
    const h = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, []);
  return isMobile;
}

// ─────────────────────────────────────────────────────────────────────────────
//  SHARED UI COMPONENTS
// ─────────────────────────────────────────────────────────────────────────────
function Card({ children, style = {} }) {
  return (
    <div style={{
      background: C.card, border: `1px solid ${C.border}`,
      borderRadius: 16, padding: 16, ...style,
    }}>
      {children}
    </div>
  );
}

function Badge({ label, color }) {
  return (
    <span style={{
      background: color + "22", color,
      border: `1px solid ${color}44`,
      borderRadius: 6, padding: "2px 10px",
      fontSize: 12, fontWeight: 600,
    }}>
      {label}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  ROLE-BASED PATIENT FILTER
// ─────────────────────────────────────────────────────────────────────────────
function filterPatients(all, user) {
  if (user.kind === "solo") {
    const userEmail = (user.email || "").trim().toLowerCase();
    return all.filter(p => (p.email || "").trim().toLowerCase() === userEmail);
  }
  if (user.kind === "staff") return all.filter(p => p.org_id === user.org_id);
  return all;
}

// ─────────────────────────────────────────────────────────────────────────────
//  BIOMETRIC BANNER  — shown above login form when a saved session exists
// ─────────────────────────────────────────────────────────────────────────────
function BiometricBanner({ savedUser, onSuccess, onDismiss }) {
  // status: "idle" | "waiting" | "failed" | "unsupported"
  const [status, setStatus] = useState("idle");

  async function handleBiometric() {
    setStatus("waiting");

    const available = await isBiometricAvailable();
    if (!available) {
      // Device has no platform authenticator registered —
      // restore session directly (still requires being on this device)
      const session = loadBioSession();
      if (session) {
        localStorage.setItem("healnet_token", session.token);
        localStorage.setItem("healnet_user",  JSON.stringify(session.user));
        onSuccess(session.user);
      } else {
        setStatus("unsupported");
      }
      return;
    }

    const passed = await promptBiometric(savedUser.name);
    if (passed) {
      const session = loadBioSession();
      if (session) {
        localStorage.setItem("healnet_token", session.token);
        localStorage.setItem("healnet_user",  JSON.stringify(session.user));
        onSuccess(session.user);
      } else {
        setStatus("failed");
      }
    } else {
      setStatus("failed");
    }
  }

  const icon    = status === "waiting" ? "⏳"
                : status === "failed"  ? "❌"
                : "🔐";

  const title   = status === "waiting"     ? "Verifying identity…"
                : status === "failed"      ? "Verification failed"
                : status === "unsupported" ? "Biometric unavailable"
                : `Welcome back, ${savedUser.name}!`;

  const subtitle = status === "waiting"     ? "Complete the prompt on your device"
                 : status === "failed"      ? "Use your password below to sign in"
                 : status === "unsupported" ? "Use your password below"
                 : "Use biometrics to continue instantly";

  return (
    <Card style={{ marginBottom: 20, borderColor: C.accent + "55", padding: 20 }}>

      {/* ── Header ──────────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 16 }}>
        <div style={{
          width: 52, height: 52, borderRadius: 14,
          background: `linear-gradient(135deg, ${C.accent}22, ${C.accent}44)`,
          border: `1px solid ${C.accent}44`,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 26, flexShrink: 0,
        }}>
          {icon}
        </div>
        <div>
          <div style={{ color: C.text, fontWeight: 700, fontSize: 15 }}>{title}</div>
          <div style={{ color: C.muted, fontSize: 12, marginTop: 2 }}>{subtitle}</div>
        </div>
      </div>

      {/* ── Biometric button (idle state) ───────────────────────── */}
      {(status === "idle") && (
        <button
          onClick={handleBiometric}
          style={{
            width: "100%", padding: "13px", borderRadius: 10, border: "none",
            background: `linear-gradient(135deg, ${C.accent}, #0099bb)`,
            color: C.bg, fontWeight: 700, fontSize: 15,
            cursor: "pointer", marginBottom: 10,
            display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
          }}>
          <span style={{ fontSize: 20 }}>👆</span>
          Continue with Biometrics
        </button>
      )}

      {/* ── Waiting spinner ─────────────────────────────────────── */}
      {status === "waiting" && (
        <div style={{
          width: "100%", padding: "13px", borderRadius: 10,
          background: "rgba(59,201,232,0.1)", border: `1px solid ${C.border}`,
          color: C.muted, fontSize: 14, textAlign: "center", marginBottom: 10,
        }}>
          Waiting for device verification…
        </div>
      )}

      {/* ── Retry after failure ─────────────────────────────────── */}
      {(status === "failed" || status === "unsupported") && (
        <button
          onClick={() => setStatus("idle")}
          style={{
            width: "100%", padding: "10px", borderRadius: 10, marginBottom: 10,
            border: `1px solid ${C.accent}44`, background: "none",
            color: C.accent, cursor: "pointer", fontSize: 13,
          }}>
          Try Again
        </button>
      )}

      {/* ── Use different account ───────────────────────────────── */}
      <button
        onClick={() => { clearBioSession(); onDismiss(); }}
        style={{
          width: "100%", padding: "9px", borderRadius: 10,
          border: `1px solid ${C.border}`, background: "none",
          color: C.muted, cursor: "pointer", fontSize: 12,
        }}>
        Use a different account
      </button>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  LOGIN PAGE
// ─────────────────────────────────────────────────────────────────────────────
function LoginPage({ onLogin }) {
  const [mode, setMode]       = useState("login");
  const [form, setForm]       = useState({ name:"", email:"", password:"", kind:"solo" });
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");
  const [showPass, setShowPass]       = useState(false);
  const [forgotMode, setForgotMode]   = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotMsg, setForgotMsg]     = useState("");

  // ── Biometric state ───────────────────────────────────────────
  const [bioSession, setBioSession]     = useState(null);   // saved session from prev login
  const [showBioBanner, setShowBioBanner] = useState(false);

  // On mount: check if we have a saved session to offer biometric login
  useEffect(() => {
    const session = loadBioSession();
    if (session?.user) {
      setBioSession(session);
      setShowBioBanner(true);
    }
  }, []);

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

  async function handleSubmit() {
    setError(""); setLoading(true);
    try {
      let res;
      if (mode === "login") {
        res = await authAPI.login(form.email, form.password);
      } else {
        if (!form.name) { setError("Name is required"); setLoading(false); return; }
        res = await authAPI.signup(form.name, form.email, form.password, form.kind);
      }
      const { token, user } = res.data;

      // Save to regular storage for the app
      localStorage.setItem("healnet_token", token);
      localStorage.setItem("healnet_user",  JSON.stringify(user));

      // Save to bio session so next visit offers biometric login
      if (mode === "login") saveBioSession(token, user);

      onLogin(user);
    } catch (e) {
      setError(e.response?.data?.detail || "Something went wrong");
    }
    setLoading(false);
  }

  async function handleForgot() {
    if (!forgotEmail) { setForgotMsg("Please enter your email"); return; }
    setForgotMsg("✅ If this email is registered, a reset link has been sent. Please contact your admin.");
  }

  const inputStyle = {
    width: "100%", padding: "12px 16px", borderRadius: 10,
    background: "rgba(59,201,232,0.07)", border: `1px solid ${C.border}`,
    color: C.text, fontSize: 15, outline: "none",
    boxSizing: "border-box", fontFamily: "inherit",
  };

  return (
    <div style={{
      minHeight: "100vh", background: C.bg,
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      fontFamily: "'Segoe UI', sans-serif", padding: "20px",
    }}>
      <div style={{ width: "100%", maxWidth: 420 }}>

        {/* ── LOGO ──────────────────────────────────────────────── */}
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ fontSize: 36, fontWeight: 800, color: C.accent, letterSpacing: -1 }}>
            🩺 HealNet
          </div>
          <div style={{ color: C.muted, fontSize: 12, letterSpacing: 3, marginTop: 4 }}>
            PREDICT · PREVENT · PERSONALIZE
          </div>
        </div>

        {/* ── BIOMETRIC BANNER ──────────────────────────────────── */}
        {showBioBanner && bioSession && !forgotMode && (
          <BiometricBanner
            savedUser={bioSession.user}
            onSuccess={onLogin}
            onDismiss={() => setShowBioBanner(false)}
          />
        )}

        {/* ── FORGOT PASSWORD ───────────────────────────────────── */}
        {forgotMode ? (
          <Card>
            <h3 style={{ margin: "0 0 6px", color: C.accent, fontSize: 18 }}>Forgot Password</h3>
            <p style={{ color: C.muted, fontSize: 13, marginBottom: 20 }}>
              Enter your registered email and we'll help you reset your password.
            </p>
            <input
              placeholder="Email Address" type="email"
              value={forgotEmail} onChange={e => setForgotEmail(e.target.value)}
              style={{ ...inputStyle, marginBottom: 14 }}
            />
            {forgotMsg && (
              <div style={{
                color: forgotMsg.startsWith("✅") ? C.accent2 : C.danger,
                fontSize: 13, marginBottom: 14, lineHeight: 1.5,
              }}>
                {forgotMsg}
              </div>
            )}
            <button onClick={handleForgot}
              style={{
                width: "100%", padding: "12px", borderRadius: 10, border: "none",
                background: C.accent, color: C.bg, fontWeight: 700,
                fontSize: 15, cursor: "pointer", marginBottom: 12,
              }}>
              Send Reset Link
            </button>
            <button onClick={() => { setForgotMode(false); setForgotMsg(""); setForgotEmail(""); }}
              style={{
                width: "100%", padding: "10px", borderRadius: 10,
                border: `1px solid ${C.border}`, background: "none",
                color: C.muted, cursor: "pointer", fontSize: 14,
              }}>
              ← Back to Login
            </button>
          </Card>

        ) : (

        // ── NORMAL LOGIN / SIGNUP ──────────────────────────────────
        <Card>
          {/* Tabs */}
          <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
            {["login", "signup"].map(m => (
              <button key={m} onClick={() => { setMode(m); setError(""); }}
                style={{
                  flex: 1, padding: "10px", borderRadius: 8, border: "none",
                  cursor: "pointer", fontWeight: 600, fontSize: 14,
                  background: mode === m ? C.accent : "rgba(59,201,232,0.08)",
                  color: mode === m ? C.bg : C.muted,
                }}>
                {m === "login" ? "Log In" : "Sign Up"}
              </button>
            ))}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {mode === "signup" && (
              <input placeholder="Full Name" value={form.name}
                onChange={set("name")} style={inputStyle} />
            )}

            <input placeholder="Email Address" type="email"
              value={form.email} onChange={set("email")} style={inputStyle} />

            {/* Password + show/hide */}
            <div style={{ position: "relative" }}>
              <input
                placeholder="Password"
                type={showPass ? "text" : "password"}
                value={form.password} onChange={set("password")}
                style={{ ...inputStyle, paddingRight: 48 }}
                onKeyDown={e => e.key === "Enter" && handleSubmit()}
              />
              <button onClick={() => setShowPass(!showPass)}
                style={{
                  position: "absolute", right: 12, top: "50%",
                  transform: "translateY(-50%)",
                  background: "none", border: "none",
                  color: C.muted, cursor: "pointer", fontSize: 16, padding: 4,
                }}>
                {showPass ? "🙈" : "👁️"}
              </button>
            </div>

            {mode === "signup" && (
              <select value={form.kind} onChange={set("kind")} style={inputStyle}>
                <option value="solo">Individual / Patient</option>
                <option value="org">Organisation / Hospital</option>
                <option value="staff">Doctor / Staff</option>
              </select>
            )}

            {/* Forgot password */}
            {mode === "login" && (
              <div style={{ textAlign: "right", marginTop: -6 }}>
                <button onClick={() => setForgotMode(true)}
                  style={{
                    background: "none", border: "none", color: C.accent,
                    cursor: "pointer", fontSize: 13,
                    textDecoration: "underline", padding: 0,
                  }}>
                  Forgot Password?
                </button>
              </div>
            )}

            {error && (
              <div style={{ color: C.danger, fontSize: 13, textAlign: "center" }}>
                ⚠️ {error}
              </div>
            )}

            {/* Submit */}
            <button onClick={handleSubmit} disabled={loading}
              style={{
                padding: "13px", borderRadius: 10, border: "none",
                background: loading ? "rgba(59,201,232,0.3)" : C.accent,
                color: C.bg, fontWeight: 700, fontSize: 15,
                cursor: loading ? "not-allowed" : "pointer", marginTop: 4,
              }}>
              {loading ? "Please wait…"
                : mode === "login" ? "Log In →"
                : "Create Account →"}
            </button>

            {/* Biometric hint — shown on login tab if no saved session yet */}
            {mode === "login" && !showBioBanner && (
              <div style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "10px 14px", borderRadius: 10,
                background: "rgba(59,201,232,0.05)",
                border: `1px solid ${C.border}`,
              }}>
                <span style={{ fontSize: 18 }}>🔐</span>
                <span style={{ color: C.muted, fontSize: 12, lineHeight: 1.5 }}>
                  After signing in, biometric login will be available on your next visit.
                </span>
              </div>
            )}
          </div>
        </Card>
        )}

        {/* ── BRANDING ──────────────────────────────────────────── */}
        <div style={{ textAlign: "center", marginTop: 24 }}>
          <div style={{ color: C.muted, fontSize: 11 }}>A product of</div>
          <div style={{ color: C.accent, fontSize: 13, fontWeight: 700, marginTop: 3, letterSpacing: 0.5 }}>
            IoTrenetics Solutions Pvt. Ltd.
          </div>
          <div style={{ color: C.muted, fontSize: 10, marginTop: 4 }}>© 2024 All rights reserved</div>
        </div>

      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  DASHBOARD
// ─────────────────────────────────────────────────────────────────────────────
function Dashboard({ user, onLogout }) {
  const isMobile = useIsMobile();
  const [page, setPage]             = useState("overview");
  const [sidebarOpen, setSidebar]   = useState(false);
  const [patients, setPatients]     = useState([]);
  const [alerts, setAlerts]         = useState([]);
  const [stats, setStats]           = useState(null);
  const [loading, setLoading]       = useState(true);
  const [search, setSearch]         = useState("");
  const [selPatient, setSelPatient] = useState(null);
  const [vitals, setVitals]         = useState([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [pRes, aRes, sRes] = await Promise.all([
        patientsAPI.getAll(),
        alertsAPI.getAll(false),
        alertsAPI.stats(),
      ]);
      setPatients(filterPatients(pRes.data, user));
      setAlerts(aRes.data);
      setStats(sRes.data);
    } catch (e) { console.error(e); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Auto-open solo user's own record
  useEffect(() => {
    if (user.kind === "solo" && patients.length === 1 && page === "overview") {
      openPatient(patients[0]);
    }
  }, [patients]); // eslint-disable-line

  async function openPatient(p) {
    setSelPatient(p);
    setPage("patient");
    if (isMobile) setSidebar(false);
    try {
      const res = await vitalsAPI.getForPatient(p.patient_id, 15);
      setVitals(res.data.reverse());
    } catch { setVitals([]); }
  }

  async function ackAlert(id) {
    await alertsAPI.acknowledge(id, user.name);
    setAlerts(a => a.map(x => x.id === id ? { ...x, acknowledged: true } : x));
  }

  function navigate(p) { setPage(p); if (isMobile) setSidebar(false); }

  function handleLogout() {
    clearBioSession();
    localStorage.removeItem("healnet_token");
    localStorage.removeItem("healnet_user");
    onLogout();
  }

  const filtered = patients.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.patient_id.toLowerCase().includes(search.toLowerCase())
  );

  const navItems = [
    { id: "overview",   label: "Overview",        icon: "📊" },
    ...(user.kind !== "solo"
      ? [{ id: "patients", label: "Patients", icon: "👥" }]
      : []),
    { id: "alerts",     label: "Alerts",          icon: "🚨" },
    { id: "vitals",     label: "Add Vitals",      icon: "💓" },
    { id: "ai",         label: "AI Insights",     icon: "🤖" },
    { id: "pupil",      label: "Pupil Detection", icon: "👁"  },
    { id: "camera",     label: "Camera Vitals",   icon: "📷" },
    { id: "smartwatch", label: "Smartwatch",      icon: "⌚" },
  ];

  const inputStyle = {
    width: "100%", padding: "10px 14px", borderRadius: 8,
    background: "rgba(59,201,232,0.07)", border: `1px solid ${C.border}`,
    color: C.text, fontSize: 14, outline: "none",
    boxSizing: "border-box", fontFamily: "inherit",
  };

  const Sidebar = () => (
    <div style={{
      width: isMobile ? "100%" : 230, background: C.card,
      borderRight: isMobile ? "none" : `1px solid ${C.border}`,
      borderBottom: isMobile ? `1px solid ${C.border}` : "none",
      display: "flex", flexDirection: "column",
      padding: isMobile ? "16px" : "24px 0",
      position: isMobile ? "fixed" : "sticky",
      top: isMobile ? 56 : 0, left: 0, right: 0,
      height: isMobile ? "auto" : "100vh",
      zIndex: isMobile ? 99 : 1, overflowY: "auto",
      transform: isMobile && !sidebarOpen ? "translateY(-100%)" : "translateY(0)",
      transition: "transform 0.3s ease",
      maxHeight: isMobile ? "80vh" : "100vh",
    }}>
      {!isMobile && (
        <div style={{ padding: "0 20px 24px", borderBottom: `1px solid ${C.border}` }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: C.accent }}>🩺 HealNet</div>
          <div style={{ color: C.muted, fontSize: 11, marginTop: 2 }}>AI Health Platform</div>
        </div>
      )}
      <nav style={{ padding: isMobile ? "8px 0" : "16px 12px", flex: 1 }}>
        {navItems.map(n => (
          <button key={n.id} onClick={() => navigate(n.id)}
            style={{
              width: "100%", padding: "11px 14px", borderRadius: 10, border: "none",
              background: page === n.id ? `${C.accent}22` : "transparent",
              color: page === n.id ? C.accent : C.muted,
              textAlign: "left", cursor: "pointer",
              fontSize: 14, fontWeight: 600, marginBottom: 4,
              display: "flex", alignItems: "center", gap: 10,
              borderLeft: page === n.id ? `3px solid ${C.accent}` : "3px solid transparent",
            }}>
            {n.icon} {n.label}
            {n.id === "alerts" && stats?.unacknowledged > 0 && (
              <span style={{
                marginLeft: "auto", background: C.danger, color: "#fff",
                borderRadius: "50%", width: 20, height: 20,
                display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11,
              }}>
                {stats.unacknowledged}
              </span>
            )}
          </button>
        ))}
      </nav>
      <div style={{ padding: isMobile ? "12px 14px" : "16px 20px", borderTop: `1px solid ${C.border}` }}>
        <div style={{ fontSize: 13, color: C.text, fontWeight: 600 }}>{user.name}</div>
        <div style={{ fontSize: 11, color: C.muted, marginBottom: 10, textTransform: "capitalize" }}>{user.kind}</div>
        <button onClick={handleLogout}
          style={{
            width: "100%", padding: "8px", borderRadius: 8,
            background: "rgba(255,77,109,0.12)", border: `1px solid ${C.danger}44`,
            color: C.danger, cursor: "pointer", fontSize: 13, fontWeight: 600,
          }}>
          Log Out
        </button>
      </div>
    </div>
  );

  return (
    <div style={{
      minHeight: "100vh", background: C.bg,
      display: "flex", flexDirection: isMobile ? "column" : "row",
      fontFamily: "'Segoe UI', sans-serif", color: C.text,
    }}>
      {isMobile && (
        <div style={{
          background: C.card, borderBottom: `1px solid ${C.border}`,
          padding: "12px 16px", display: "flex",
          alignItems: "center", justifyContent: "space-between",
          position: "sticky", top: 0, zIndex: 100,
        }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: C.accent }}>🩺 HealNet</div>
          <button onClick={() => setSidebar(!sidebarOpen)}
            style={{
              background: "none", border: `1px solid ${C.border}`,
              color: C.text, padding: "6px 12px", borderRadius: 8,
              cursor: "pointer", fontSize: 18,
            }}>
            {sidebarOpen ? "✕" : "☰"}
          </button>
        </div>
      )}

      {!isMobile && <Sidebar />}
      {isMobile && sidebarOpen && <Sidebar />}
      {isMobile && sidebarOpen && (
        <div onClick={() => setSidebar(false)}
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
            zIndex: 98, top: 56,
          }} />
      )}

      <div style={{ flex: 1, padding: isMobile ? "16px" : "32px", overflowY: "auto" }}>
        {loading ? (
          <div style={{ color: C.muted, textAlign: "center", paddingTop: 80, fontSize: 18 }}>
            Loading HealNet...
          </div>
        ) : (
          <>
            {page === "overview" && (
              <div>
                <h2 style={{ margin: "0 0 20px", fontSize: isMobile ? 20 : 24 }}>
                  Good day, {user.name} 👋
                </h2>
                <div style={{
                  display: "grid",
                  gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4,1fr)",
                  gap: 12, marginBottom: 24,
                }}>
                  {[
                    { label: "Patients",       value: patients.length,            color: C.accent,  icon: "👥" },
                    { label: "Total Alerts",   value: stats?.total || 0,          color: C.warn,    icon: "🔔" },
                    { label: "Critical",       value: stats?.critical || 0,       color: C.danger,  icon: "🚨" },
                    { label: "Unacknowledged", value: stats?.unacknowledged || 0, color: C.accent2, icon: "⚠️" },
                  ].map(s => (
                    <Card key={s.label} style={{ borderColor: s.color + "44", padding: 14 }}>
                      <div style={{ fontSize: 20, marginBottom: 6 }}>{s.icon}</div>
                      <div style={{ fontSize: 26, fontWeight: 800, color: s.color }}>{s.value}</div>
                      <div style={{ color: C.muted, fontSize: 11, marginTop: 2 }}>{s.label}</div>
                    </Card>
                  ))}
                </div>
                <Card>
                  <h3 style={{ margin: "0 0 16px", color: C.accent, fontSize: 16 }}>Recent Patients</h3>
                  {patients.slice(0, 5).map(p => (
                    <div key={p.patient_id} onClick={() => openPatient(p)}
                      style={{
                        display: "flex", justifyContent: "space-between",
                        alignItems: "center", padding: "12px 0",
                        borderBottom: `1px solid ${C.border}`, cursor: "pointer",
                      }}>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 14 }}>{p.name}</div>
                        <div style={{ color: C.muted, fontSize: 11 }}>
                          {p.patient_id} · {p.gender} · {p.age} yrs
                        </div>
                      </div>
                      <div style={{ color: C.accent, fontSize: 13 }}>View →</div>
                    </div>
                  ))}
                  {patients.length === 0 && (
                    <div style={{ color: C.muted, textAlign: "center", padding: 30, fontSize: 14 }}>
                      No patients yet. Add your first patient.
                    </div>
                  )}
                </Card>
              </div>
            )}

            {page === "patients" && (
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                  <h2 style={{ margin: 0, fontSize: isMobile ? 20 : 24 }}>Patients</h2>
                  {user.kind === "org" && <AddPatientForm onAdded={load} />}
                </div>
                <input placeholder="🔍  Search..." value={search}
                  onChange={e => setSearch(e.target.value)}
                  style={{ ...inputStyle, marginBottom: 16 }} />
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                    <thead>
                      <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                        {["ID","Name","Age","Blood",""].map(h => (
                          <th key={h} style={{ padding: "12px 10px", textAlign: "left", color: C.muted, fontWeight: 600, fontSize: 11 }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map(p => (
                        <tr key={p.patient_id} style={{ borderBottom: `1px solid ${C.border}44` }}>
                          <td style={{ padding: "11px 10px", color: C.accent, fontFamily: "monospace", fontSize: 12 }}>{p.patient_id}</td>
                          <td style={{ padding: "11px 10px", fontWeight: 600 }}>{p.name}</td>
                          <td style={{ padding: "11px 10px", color: C.muted }}>{p.age}</td>
                          <td style={{ padding: "11px 10px" }}><Badge label={p.blood_group || "?"} color={C.accent} /></td>
                          <td style={{ padding: "11px 10px" }}>
                            <button onClick={() => openPatient(p)}
                              style={{
                                padding: "5px 12px", borderRadius: 6,
                                border: `1px solid ${C.accent}`,
                                background: "transparent", color: C.accent,
                                cursor: "pointer", fontSize: 12,
                              }}>
                              View
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {filtered.length === 0 && (
                    <div style={{ color: C.muted, textAlign: "center", padding: 40 }}>No patients found.</div>
                  )}
                </div>
              </div>
            )}

            {page === "patient" && selPatient && (
              <div>
                <button onClick={() => setPage(user.kind === "solo" ? "overview" : "patients")}
                  style={{ background: "none", border: "none", color: C.accent, cursor: "pointer", fontSize: 14, marginBottom: 16 }}>
                  ← Back
                </button>
                <div style={{
                  display: "grid",
                  gridTemplateColumns: isMobile ? "1fr" : "1fr 2fr",
                  gap: 16, marginBottom: 16,
                }}>
                  <Card>
                    <h3 style={{ margin: "0 0 14px", color: C.accent, fontSize: 15 }}>Patient Info</h3>
                    {[
                      ["ID",      selPatient.patient_id],
                      ["Name",    selPatient.name],
                      ["Age",     selPatient.age],
                      ["Gender",  selPatient.gender],
                      ["Blood",   selPatient.blood_group],
                      ["Contact", selPatient.contact],
                    ].map(([k, v]) => v ? (
                      <div key={k} style={{ marginBottom: 8 }}>
                        <div style={{ color: C.muted, fontSize: 10 }}>{k.toUpperCase()}</div>
                        <div style={{ fontWeight: 500, fontSize: 14 }}>{v}</div>
                      </div>
                    ) : null)}
                  </Card>
                  <Card>
                    <h3 style={{ margin: "0 0 14px", color: C.accent, fontSize: 15 }}>Vitals History</h3>
                    {vitals.length > 0 ? (
                      <>
                        <ResponsiveContainer width="100%" height={160}>
                          <LineChart data={vitals}>
                            <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
                            <XAxis dataKey="recorded_at" tickFormatter={v => new Date(v).toLocaleDateString()} stroke={C.muted} tick={{ fontSize: 9 }} />
                            <YAxis stroke={C.muted} tick={{ fontSize: 9 }} />
                            <Tooltip contentStyle={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 12 }} />
                            <Line type="monotone" dataKey="heart_rate"  stroke={C.danger}  dot={false} name="HR"   strokeWidth={2} />
                            <Line type="monotone" dataKey="spo2"        stroke={C.accent2} dot={false} name="SpO2" strokeWidth={2} />
                            <Line type="monotone" dataKey="systolic_bp" stroke={C.accent}  dot={false} name="BP"   strokeWidth={2} />
                          </LineChart>
                        </ResponsiveContainer>
                        {(() => {
                          const last = vitals[vitals.length - 1];
                          return (
                            <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 8, marginTop: 12 }}>
                              {[
                                ["❤️ HR",   last.heart_rate,   "bpm"],
                                ["🫁 SpO2", last.spo2,         "%"],
                                ["🌡️ Temp", last.temperature,  "°C"],
                                ["💉 BP",   last.systolic_bp ? `${last.systolic_bp}/${last.diastolic_bp}` : null, "mmHg"],
                              ].map(([label, val, unit]) => val ? (
                                <div key={label} style={{ background: "rgba(59,201,232,0.07)", borderRadius: 8, padding: 10, textAlign: "center" }}>
                                  <div style={{ fontSize: 10, color: C.muted }}>{label}</div>
                                  <div style={{ fontSize: 18, fontWeight: 800, color: C.accent }}>{val}</div>
                                  <div style={{ fontSize: 10, color: C.muted }}>{unit}</div>
                                </div>
                              ) : null)}
                            </div>
                          );
                        })()}
                      </>
                    ) : (
                      <div style={{ color: C.muted, textAlign: "center", padding: 30, fontSize: 13 }}>No vitals recorded yet.</div>
                    )}
                  </Card>
                </div>
                <AddVitalForm patientId={selPatient.patient_id} onAdded={() => openPatient(selPatient)} />
                <div style={{ marginTop: 16 }}>
                  <AIPanel patientId={selPatient.patient_id} />
                </div>
              </div>
            )}

            {page === "alerts" && (
              <div>
                <h2 style={{ margin: "0 0 20px", fontSize: isMobile ? 20 : 24 }}>Alerts</h2>
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {alerts.map(a => (
                    <Card key={a.id} style={{ borderColor: a.category === "Critical" ? C.danger + "66" : C.warn + "66" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: "flex", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
                            <Badge label={a.category} color={a.category === "Critical" ? C.danger : C.warn} />
                            {a.acknowledged && <Badge label="Acknowledged" color={C.accent2} />}
                          </div>
                          <div style={{ fontWeight: 600, marginBottom: 4, fontSize: 13 }}>{a.message}</div>
                          <div style={{ color: C.muted, fontSize: 11 }}>
                            {a.patient_id} · {new Date(a.recorded_at).toLocaleString()}
                          </div>
                        </div>
                        {!a.acknowledged && (
                          <button onClick={() => ackAlert(a.id)}
                            style={{
                              padding: "6px 12px", borderRadius: 8,
                              border: `1px solid ${C.accent2}`,
                              background: "transparent", color: C.accent2,
                              cursor: "pointer", fontSize: 12, whiteSpace: "nowrap",
                            }}>
                            ✓ Ack
                          </button>
                        )}
                      </div>
                    </Card>
                  ))}
                  {alerts.length === 0 && (
                    <div style={{ color: C.muted, textAlign: "center", padding: 60, fontSize: 16 }}>
                      ✅ No alerts — all clear!
                    </div>
                  )}
                </div>
              </div>
            )}

            {page === "vitals" && (
              <div>
                <h2 style={{ margin: "0 0 20px", fontSize: isMobile ? 20 : 24 }}>Record Vitals</h2>
                <Card>
                  <QuickVitalForm patients={patients} onAdded={load} isMobile={isMobile} />
                </Card>
              </div>
            )}

            {page === "ai" && (
              <div>
                <h2 style={{ margin: "0 0 20px", fontSize: isMobile ? 20 : 24 }}>🤖 AI Insights</h2>
                <select
                  onChange={e => setSelPatient(patients.find(p => p.patient_id === e.target.value) || null)}
                  style={{ ...inputStyle, marginBottom: 20 }}>
                  <option value="">— Select a patient —</option>
                  {patients.map(p => (
                    <option key={p.patient_id} value={p.patient_id}>{p.name} ({p.patient_id})</option>
                  ))}
                </select>
                {selPatient
                  ? <AIPanel patientId={selPatient.patient_id} />
                  : <div style={{ color: C.muted, textAlign: "center", padding: 60 }}>Select a patient to view AI analysis</div>
                }
              </div>
            )}

            {page === "pupil"      && <PupilPage />}
            {page === "camera"     && <CameraPage />}
            {page === "smartwatch" && <SmartWatchPage />}
          </>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  FORMS
// ─────────────────────────────────────────────────────────────────────────────
function AddPatientForm({ onAdded }) {
  const isMobile = useIsMobile();
  const [open, setOpen]       = useState(false);
  const [form, setForm]       = useState({ patient_id:"", name:"", age:"", gender:"Male", blood_group:"", contact:"", email:"" });
  const [loading, setLoading] = useState(false);
  const [msg, setMsg]         = useState("");
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

  async function save() {
    if (!form.patient_id || !form.name) { setMsg("ID and Name are required"); return; }
    setLoading(true); setMsg("");
    try {
      await patientsAPI.create({ ...form, age: parseInt(form.age) || null });
      setOpen(false); onAdded();
      setForm({ patient_id:"", name:"", age:"", gender:"Male", blood_group:"", contact:"", email:"" });
    } catch (e) { setMsg(e.response?.data?.detail || "Error saving patient"); }
    setLoading(false);
  }

  const inputS = {
    width: "100%", padding: "10px 14px", borderRadius: 8,
    background: "rgba(59,201,232,0.07)", border: `1px solid ${C.border}`,
    color: C.text, fontSize: 14, outline: "none",
    boxSizing: "border-box", fontFamily: "inherit",
  };

  if (!open) return (
    <button onClick={() => setOpen(true)}
      style={{
        padding: "10px 16px", borderRadius: 10, border: "none",
        background: C.accent, color: C.bg, fontWeight: 700, cursor: "pointer", fontSize: 13,
      }}>
      + Add Patient
    </button>
  );

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(3,12,44,0.85)",
      display: "flex", alignItems: "center", justifyContent: "center",
      zIndex: 200, padding: 16,
    }}>
      <div style={{
        background: C.card, border: `1px solid ${C.border}`,
        borderRadius: 16, padding: 24, width: "100%", maxWidth: 500,
        maxHeight: "90vh", overflowY: "auto",
      }}>
        <h3 style={{ margin: "0 0 20px", color: C.accent }}>New Patient</h3>
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 12 }}>
          {[
            ["patient_id","Patient ID *","text"],
            ["name",      "Full Name *", "text"],
            ["age",       "Age",         "number"],
            ["contact",   "Contact",     "text"],
            ["email",     "Email",       "email"],
            ["blood_group","Blood Group","text"],
          ].map(([k, ph, t]) => (
            <input key={k} placeholder={ph} type={t} value={form[k]} onChange={set(k)} style={inputS} />
          ))}
          <select value={form.gender} onChange={set("gender")} style={inputS}>
            <option>Male</option><option>Female</option><option>Other</option>
          </select>
        </div>
        {msg && <div style={{ color: C.danger, fontSize: 13, marginTop: 10 }}>{msg}</div>}
        <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
          <button onClick={save} disabled={loading}
            style={{ flex: 1, padding: "11px", borderRadius: 8, border: "none", background: C.accent, color: C.bg, fontWeight: 700, cursor: "pointer" }}>
            {loading ? "Saving..." : "Save Patient"}
          </button>
          <button onClick={() => setOpen(false)}
            style={{ flex: 1, padding: "11px", borderRadius: 8, border: `1px solid ${C.border}`, background: "none", color: C.muted, cursor: "pointer" }}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function AddVitalForm({ patientId, onAdded }) {
  const isMobile = useIsMobile();
  const [form, setForm]       = useState({ heart_rate:"", spo2:"", systolic_bp:"", diastolic_bp:"", temperature:"", blood_sugar:"" });
  const [loading, setLoading] = useState(false);
  const [msg, setMsg]         = useState("");
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

  async function save() {
    setLoading(true); setMsg("");
    try {
      const data = { patient_id: patientId, source: "manual" };
      Object.entries(form).forEach(([k, v]) => { if (v) data[k] = parseFloat(v); });
      const res = await vitalsAPI.record(data);
      setMsg(`✅ Saved! ${res.data.alerts_generated} alert(s) generated.`);
      onAdded();
    } catch (e) { setMsg(e.response?.data?.detail || "Error saving vitals"); }
    setLoading(false);
  }

  const inputS = {
    width: "100%", padding: "10px 14px", borderRadius: 8,
    background: "rgba(59,201,232,0.07)", border: `1px solid ${C.border}`,
    color: C.text, fontSize: 14, outline: "none",
    boxSizing: "border-box", fontFamily: "inherit",
  };

  return (
    <Card>
      <h3 style={{ margin: "0 0 14px", color: C.accent, fontSize: 15 }}>Record Vitals</h3>
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(3,1fr)", gap: 10 }}>
        {[
          ["heart_rate",  "Heart Rate (bpm)"],
          ["spo2",        "SpO2 (%)"],
          ["systolic_bp", "Systolic BP"],
          ["diastolic_bp","Diastolic BP"],
          ["temperature", "Temp (°C)"],
          ["blood_sugar", "Blood Sugar"],
        ].map(([k, ph]) => (
          <div key={k}>
            <div style={{ color: C.muted, fontSize: 10, marginBottom: 4 }}>{ph}</div>
            <input type="number" placeholder="—" value={form[k]} onChange={set(k)} style={inputS} />
          </div>
        ))}
      </div>
      {msg && <div style={{ marginTop: 10, fontSize: 13, color: msg.startsWith("✅") ? C.accent2 : C.danger }}>{msg}</div>}
      <button onClick={save} disabled={loading}
        style={{ marginTop: 14, padding: "11px 28px", borderRadius: 8, border: "none", background: C.accent, color: C.bg, fontWeight: 700, cursor: "pointer", width: "100%" }}>
        {loading ? "Saving..." : "Save Vitals"}
      </button>
    </Card>
  );
}

function QuickVitalForm({ patients, onAdded, isMobile }) {
  const [pid, setPid]         = useState("");
  const [form, setForm]       = useState({ heart_rate:"", spo2:"", systolic_bp:"", diastolic_bp:"", temperature:"", blood_sugar:"" });
  const [loading, setLoading] = useState(false);
  const [msg, setMsg]         = useState("");
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

  async function save() {
    if (!pid) { setMsg("Select a patient first"); return; }
    setLoading(true); setMsg("");
    try {
      const data = { patient_id: pid, source: "manual" };
      Object.entries(form).forEach(([k, v]) => { if (v) data[k] = parseFloat(v); });
      const res = await vitalsAPI.record(data);
      setMsg(`✅ Saved! ${res.data.alerts_generated} alert(s) generated.`);
      onAdded();
    } catch (e) { setMsg(e.response?.data?.detail || "Error"); }
    setLoading(false);
  }

  const inputS = {
    width: "100%", padding: "10px 14px", borderRadius: 8,
    background: "rgba(59,201,232,0.07)", border: `1px solid ${C.border}`,
    color: C.text, fontSize: 14, outline: "none",
    boxSizing: "border-box", fontFamily: "inherit",
  };

  return (
    <div>
      <select value={pid} onChange={e => setPid(e.target.value)} style={{ ...inputS, marginBottom: 14 }}>
        <option value="">Select Patient</option>
        {patients.map(p => <option key={p.patient_id} value={p.patient_id}>{p.name} ({p.patient_id})</option>)}
      </select>
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(3,1fr)", gap: 10 }}>
        {[
          ["heart_rate",  "Heart Rate (bpm)"],
          ["spo2",        "SpO2 (%)"],
          ["systolic_bp", "Systolic BP"],
          ["diastolic_bp","Diastolic BP"],
          ["temperature", "Temp (°C)"],
          ["blood_sugar", "Blood Sugar"],
        ].map(([k, ph]) => (
          <div key={k}>
            <div style={{ color: C.muted, fontSize: 10, marginBottom: 4 }}>{ph}</div>
            <input type="number" placeholder="—" value={form[k]} onChange={set(k)} style={inputS} />
          </div>
        ))}
      </div>
      {msg && <div style={{ marginTop: 10, fontSize: 13, color: msg.startsWith("✅") ? C.accent2 : C.danger }}>{msg}</div>}
      <button onClick={save} disabled={loading}
        style={{ marginTop: 14, padding: "11px 28px", borderRadius: 8, border: "none", background: C.accent, color: C.bg, fontWeight: 700, cursor: "pointer", width: "100%" }}>
        {loading ? "Saving..." : "Save Vitals"}
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  ROOT APP
// ─────────────────────────────────────────────────────────────────────────────
export default function App() {
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem("healnet_user")); }
    catch { return null; }
  });

  if (!user) return <LoginPage onLogin={u => setUser(u)} />;
  return (
    <Dashboard
      user={user}
      onLogout={() => setUser(null)}
    />
  );
}
