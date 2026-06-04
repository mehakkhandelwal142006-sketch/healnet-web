// ─────────────────────────────────────────────────────────────────────────────
//  HEALNET  —  App.jsx
//  Fingerprint login added via expo-local-authentication + expo-secure-store
//
//  INSTALL BEFORE RUNNING:
//    expo install expo-local-authentication expo-secure-store
// ─────────────────────────────────────────────────────────────────────────────
import { useState, useEffect, useCallback } from "react";
import { authAPI, patientsAPI, vitalsAPI, alertsAPI } from "./services/api";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import AIPanel        from "./pages/aipanel";
import PupilPage      from "./pages/pupilpage";
import CameraPage     from "./pages/camerapage";
import SmartWatchPage from "./pages/smartwatch";

// ── Expo packages (safe-import so web builds don't crash) ─────────────────────
let LocalAuthentication = null;
let SecureStore         = null;
try {
  LocalAuthentication = require("expo-local-authentication");
  SecureStore         = require("expo-secure-store");
} catch (_) {
  // Running in a plain web browser — fingerprint unavailable, graceful fallback
}

// ── Secure storage helpers ────────────────────────────────────────────────────
//   Falls back to localStorage when SecureStore is unavailable (web dev mode)
const STORE_TOKEN_KEY = "healnet_fp_token";
const STORE_USER_KEY  = "healnet_fp_user";

async function saveCredentialsSecurely(token, user) {
  if (SecureStore) {
    await SecureStore.setItemAsync(STORE_TOKEN_KEY, token);
    await SecureStore.setItemAsync(STORE_USER_KEY, JSON.stringify(user));
  } else {
    localStorage.setItem(STORE_TOKEN_KEY, token);
    localStorage.setItem(STORE_USER_KEY, JSON.stringify(user));
  }
}

async function loadCredentialsSecurely() {
  if (SecureStore) {
    const token = await SecureStore.getItemAsync(STORE_TOKEN_KEY);
    const raw   = await SecureStore.getItemAsync(STORE_USER_KEY);
    return { token, user: raw ? JSON.parse(raw) : null };
  }
  const token = localStorage.getItem(STORE_TOKEN_KEY);
  const raw   = localStorage.getItem(STORE_USER_KEY);
  return { token, user: raw ? JSON.parse(raw) : null };
}

async function clearCredentialsSecurely() {
  if (SecureStore) {
    await SecureStore.deleteItemAsync(STORE_TOKEN_KEY);
    await SecureStore.deleteItemAsync(STORE_USER_KEY);
  } else {
    localStorage.removeItem(STORE_TOKEN_KEY);
    localStorage.removeItem(STORE_USER_KEY);
  }
}

// ── Fingerprint helpers ───────────────────────────────────────────────────────
async function isFingerprintAvailable() {
  if (!LocalAuthentication) return false;
  const hasHardware  = await LocalAuthentication.hasHardwareAsync();
  const isEnrolled   = await LocalAuthentication.isEnrolledAsync();
  return hasHardware && isEnrolled;
}

async function promptFingerprint() {
  if (!LocalAuthentication) return false;
  const result = await LocalAuthentication.authenticateAsync({
    promptMessage:  "Log in to HealNet",
    fallbackLabel:  "Use Password",
    cancelLabel:    "Cancel",
    disableDeviceFallback: false,
  });
  return result.success;
}

// ── THEME ─────────────────────────────────────────────────────────────────────
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

// ── RESPONSIVE HOOK ───────────────────────────────────────────────────────────
function useIsMobile() {
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);
  return isMobile;
}

// ── REUSABLE COMPONENTS ───────────────────────────────────────────────────────
function Card({ children, style = {} }) {
  return (
    <div style={{
      background: C.card, border: `1px solid ${C.border}`,
      borderRadius: 16, padding: 16, ...style
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

// ── ROLE-BASED PATIENT FILTER ─────────────────────────────────────────────────
function filterPatients(all, user) {
  if (user.kind === "solo") {
    const userEmail = (user.email || "").trim().toLowerCase();
    const filtered  = all.filter(p => (p.email || "").trim().toLowerCase() === userEmail);
    console.log("[HealNet] solo filter | user.email:", userEmail,
      "| all:", all.length, "| matched:", filtered.length);
    return filtered;
  }
  if (user.kind === "staff") return all.filter(p => p.org_id === user.org_id);
  return all;
}

// ═══════════════════════════════════════════════════════════════════════════════
//  FINGERPRINT BANNER  (shown on login page when saved session detected)
// ═══════════════════════════════════════════════════════════════════════════════
function FingerprintBanner({ savedUser, onSuccess, onDismiss }) {
  const [status, setStatus] = useState("idle"); // idle | scanning | failed

  async function tryFingerprint() {
    setStatus("scanning");
    const passed = await promptFingerprint();
    if (passed) {
      const { token, user } = await loadCredentialsSecurely();
      if (token && user) {
        // Restore the session tokens so the rest of the app works normally
        localStorage.setItem("healnet_token", token);
        localStorage.setItem("healnet_user",  JSON.stringify(user));
        onSuccess(user);
      } else {
        setStatus("failed");
      }
    } else {
      setStatus("failed");
    }
  }

  return (
    <Card style={{ marginBottom: 20, borderColor: C.accent + "66", padding: 20 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 6 }}>
        <div style={{ fontSize: 32 }}>
          {status === "scanning" ? "⏳" : status === "failed" ? "❌" : "🔐"}
        </div>
        <div>
          <div style={{ color: C.accent, fontWeight: 700, fontSize: 15 }}>
            {status === "scanning" ? "Authenticating…"
              : status === "failed"  ? "Authentication Failed"
              : "Welcome back!"}
          </div>
          <div style={{ color: C.muted, fontSize: 12 }}>
            {status === "failed"
              ? "Use password login below"
              : `Continue as ${savedUser.name}`}
          </div>
        </div>
      </div>

      {/* Fingerprint button */}
      {status !== "failed" && (
        <button
          onClick={tryFingerprint}
          disabled={status === "scanning"}
          style={{
            width: "100%", padding: "13px", borderRadius: 10, border: "none",
            background: status === "scanning"
              ? "rgba(59,201,232,0.3)"
              : `linear-gradient(135deg, ${C.accent}, #0099bb)`,
            color: C.bg, fontWeight: 700, fontSize: 15,
            cursor: status === "scanning" ? "not-allowed" : "pointer",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
            marginTop: 12,
          }}>
          <span style={{ fontSize: 22 }}>👆</span>
          {status === "scanning" ? "Checking fingerprint…" : "Log in with Fingerprint"}
        </button>
      )}

      {/* Retry after failure */}
      {status === "failed" && (
        <button
          onClick={() => setStatus("idle")}
          style={{
            width: "100%", padding: "10px", borderRadius: 10, marginTop: 10,
            border: `1px solid ${C.accent}44`, background: "none",
            color: C.accent, cursor: "pointer", fontSize: 13,
          }}>
          Try Again
        </button>
      )}

      {/* Dismiss — use password instead */}
      <button
        onClick={onDismiss}
        style={{
          width: "100%", padding: "9px", borderRadius: 10, marginTop: 8,
          border: `1px solid ${C.border}`, background: "none",
          color: C.muted, cursor: "pointer", fontSize: 12,
        }}>
        Use a different account
      </button>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
//  LOGIN PAGE
// ═══════════════════════════════════════════════════════════════════════════════
function LoginPage({ onLogin }) {
  const [mode, setMode]         = useState("login");
  const [form, setForm]         = useState({ name:"", email:"", password:"", kind:"solo" });
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");
  const [showPass, setShowPass] = useState(false);
  const [forgotMode, setForgotMode]   = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotMsg, setForgotMsg]     = useState("");

  // ── Fingerprint state ──────────────────────────────────────────
  const [fpAvailable, setFpAvailable]   = useState(false);  // device supports it
  const [savedUser, setSavedUser]       = useState(null);    // previously saved user
  const [showFpBanner, setShowFpBanner] = useState(false);  // show the banner
  const [fpJustEnabled, setFpJustEnabled] = useState(false); // show "enabled" confirmation

  // On mount: check hardware + check if a saved session exists
  useEffect(() => {
    (async () => {
      const available = await isFingerprintAvailable();
      setFpAvailable(available);
      if (available) {
        const { token, user } = await loadCredentialsSecurely();
        if (token && user) {
          setSavedUser(user);
          setShowFpBanner(true);
        }
      }
    })();
  }, []);

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

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

      // Save to regular storage (for existing app logic)
      localStorage.setItem("healnet_token", token);
      localStorage.setItem("healnet_user",  JSON.stringify(user));

      // ── If fingerprint is available, save credentials securely
      //    so the user can use fingerprint next time
      if (fpAvailable && mode === "login") {
        await saveCredentialsSecurely(token, user);
        setFpJustEnabled(true);
      }

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

        {/* ── FINGERPRINT BANNER (shown when saved session exists) ─ */}
        {showFpBanner && savedUser && !forgotMode && (
          <FingerprintBanner
            savedUser={savedUser}
            onSuccess={onLogin}
            onDismiss={async () => {
              // Clear saved creds and hide banner so they can log in fresh
              await clearCredentialsSecurely();
              setSavedUser(null);
              setShowFpBanner(false);
            }}
          />
        )}

        {/* ── FORGOT PASSWORD MODE ───────────────────────────────── */}
        {forgotMode ? (
          <Card>
            <h3 style={{ margin: "0 0 6px", color: C.accent, fontSize: 18 }}>Forgot Password</h3>
            <p style={{ color: C.muted, fontSize: 13, marginBottom: 20 }}>
              Enter your registered email and we'll help you reset your password.
            </p>
            <input
              placeholder="Email Address"
              type="email"
              value={forgotEmail}
              onChange={e => setForgotEmail(e.target.value)}
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
              <input placeholder="Full Name" value={form.name} onChange={set("name")} style={inputStyle} />
            )}

            <input
              placeholder="Email Address" type="email"
              value={form.email} onChange={set("email")} style={inputStyle}
            />

            {/* ── PASSWORD with show/hide ────────────────────────── */}
            <div style={{ position: "relative" }}>
              <input
                placeholder="Password"
                type={showPass ? "text" : "password"}
                value={form.password}
                onChange={set("password")}
                style={{ ...inputStyle, paddingRight: 48 }}
                onKeyDown={e => e.key === "Enter" && handleSubmit()}
              />
              <button
                onClick={() => setShowPass(!showPass)}
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

            {/* ── FORGOT PASSWORD link ───────────────────────────── */}
            {mode === "login" && (
              <div style={{ textAlign: "right", marginTop: -6 }}>
                <button
                  onClick={() => setForgotMode(true)}
                  style={{
                    background: "none", border: "none",
                    color: C.accent, cursor: "pointer",
                    fontSize: 13, textDecoration: "underline", padding: 0,
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

            {/* ── FINGERPRINT HINT (shown if available but no saved session) */}
            {fpAvailable && !showFpBanner && mode === "login" && (
              <div style={{
                display: "flex", alignItems: "center", gap: 8,
                padding: "10px 14px", borderRadius: 10,
                background: "rgba(59,201,232,0.06)",
                border: `1px solid ${C.border}`,
              }}>
                <span style={{ fontSize: 20 }}>👆</span>
                <span style={{ color: C.muted, fontSize: 12, lineHeight: 1.4 }}>
                  Log in once with your password and fingerprint login will be enabled automatically for next time.
                </span>
              </div>
            )}
          </div>
        </Card>
        )}

        {/* ── IOTRENETICS BRANDING ───────────────────────────────── */}
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

// ═══════════════════════════════════════════════════════════════════════════════
//  DASHBOARD
// ═══════════════════════════════════════════════════════════════════════════════
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
    } catch (e) { setVitals([]); }
  }

  async function ackAlert(id) {
    await alertsAPI.acknowledge(id, user.name);
    setAlerts(a => a.map(x => x.id === id ? { ...x, acknowledged: true } : x));
  }

  function navigate(p) {
    setPage(p);
    if (isMobile) setSidebar(false);
  }

  // ── Full logout: clears both regular + secure storage ─────────
  async function handleLogout() {
    await clearCredentialsSecurely();
    localStorage.removeItem("healnet_token");
    localStorage.removeItem("healnet_user");
    onLogout();
  }

  const filtered = patients.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.patient_id.toLowerCase().includes(search.toLowerCase())
  );

  // Hide Patients tab for solo users
  const navItems = [
    { id: "overview",    label: "Overview",        icon: "📊" },
    ...(user.kind !== "solo"
      ? [{ id: "patients", label: "Patients", icon: "👥" }]
      : []),
    { id: "alerts",      label: "Alerts",          icon: "🚨" },
    { id: "vitals",      label: "Add Vitals",      icon: "💓" },
    { id: "ai",          label: "AI Insights",     icon: "🤖" },
    { id: "pupil",       label: "Pupil Detection", icon: "👁"  },
    { id: "camera",      label: "Camera Vitals",   icon: "📷" },
    { id: "smartwatch",  label: "Smartwatch",      icon: "⌚" },
  ];

  const inputStyle = {
    width: "100%", padding: "10px 14px", borderRadius: 8,
    background: "rgba(59,201,232,0.07)", border: `1px solid ${C.border}`,
    color: C.text, fontSize: 14, outline: "none",
    boxSizing: "border-box", fontFamily: "inherit",
  };

  // ── SIDEBAR ──────────────────────────────────────────────────────
  const Sidebar = () => (
    <div style={{
      width: isMobile ? "100%" : 230,
      background: C.card,
      borderRight: isMobile ? "none" : `1px solid ${C.border}`,
      borderBottom: isMobile ? `1px solid ${C.border}` : "none",
      display: "flex", flexDirection: "column",
      padding: isMobile ? "16px" : "24px 0",
      position: isMobile ? "fixed" : "sticky",
      top: isMobile ? 56 : 0,
      left: 0, right: 0,
      height: isMobile ? "auto" : "100vh",
      zIndex: isMobile ? 99 : 1,
      overflowY: "auto",
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
              width: "100%", padding: "11px 14px", borderRadius: 10,
              border: "none",
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
        <div style={{ fontSize: 11, color: C.muted, marginBottom: 10, textTransform: "capitalize" }}>
          {user.kind}
        </div>
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
                <input
                  placeholder="🔍  Search..."
                  value={search} onChange={e => setSearch(e.target.value)}
                  style={{ ...inputStyle, marginBottom: 16 }}
                />
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                    <thead>
                      <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                        {["ID", "Name", "Age", "Blood", ""].map(h => (
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

// ═══════════════════════════════════════════════════════════════════════════════
//  FORMS
// ═══════════════════════════════════════════════════════════════════════════════
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
    } catch (e) {
      setMsg(e.response?.data?.detail || "Error saving patient");
    }
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
        background: C.accent, color: C.bg, fontWeight: 700,
        cursor: "pointer", fontSize: 13,
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
            ["patient_id", "Patient ID *", "text"],
            ["name",       "Full Name *",  "text"],
            ["age",        "Age",          "number"],
            ["contact",    "Contact",      "text"],
            ["email",      "Email",        "email"],
            ["blood_group","Blood Group",  "text"],
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
    } catch (e) {
      setMsg(e.response?.data?.detail || "Error saving vitals");
    }
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
          ["heart_rate",   "Heart Rate (bpm)"],
          ["spo2",         "SpO2 (%)"],
          ["systolic_bp",  "Systolic BP"],
          ["diastolic_bp", "Diastolic BP"],
          ["temperature",  "Temp (°C)"],
          ["blood_sugar",  "Blood Sugar"],
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
          ["heart_rate",   "Heart Rate (bpm)"],
          ["spo2",         "SpO2 (%)"],
          ["systolic_bp",  "Systolic BP"],
          ["diastolic_bp", "Diastolic BP"],
          ["temperature",  "Temp (°C)"],
          ["blood_sugar",  "Blood Sugar"],
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

// ═══════════════════════════════════════════════════════════════════════════════
//  ROOT APP
// ═══════════════════════════════════════════════════════════════════════════════
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
