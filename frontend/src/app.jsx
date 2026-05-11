import { useState, useEffect, useCallback } from "react";
import { authAPI, patientsAPI, vitalsAPI, alertsAPI } from "./services/api";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import AIPanel    from "./pages/AIPanel";
import PupilPage  from "./pages/PupilPage";
import CameraPage from "./pages/CameraPage";

// ── THEME ─────────────────────────────────────────────────────────
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

const css = (s) => s;

// ── REUSABLE COMPONENTS ───────────────────────────────────────────
function Card({ children, style = {} }) {
  return (
    <div style={css({
      background: C.card, border: `1px solid ${C.border}`,
      borderRadius: 16, padding: 24, ...style
    })}>
      {children}
    </div>
  );
}

function Badge({ label, color }) {
  return (
    <span style={css({
      background: color + "22", color,
      border: `1px solid ${color}44`,
      borderRadius: 6, padding: "2px 10px",
      fontSize: 12, fontWeight: 600,
    })}>
      {label}
    </span>
  );
}

// ═══════════════════════════════════════════════════════════════════
//  LOGIN PAGE
// ═══════════════════════════════════════════════════════════════════
function LoginPage({ onLogin }) {
  const [mode, setMode]       = useState("login");
  const [form, setForm]       = useState({ name:"", email:"", password:"", kind:"solo" });
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");

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
      localStorage.setItem("healnet_token", res.data.token);
      localStorage.setItem("healnet_user",  JSON.stringify(res.data.user));
      onLogin(res.data.user);
    } catch (e) {
      setError(e.response?.data?.detail || "Something went wrong");
    }
    setLoading(false);
  }

  const inputStyle = css({
    width: "100%", padding: "12px 16px", borderRadius: 10,
    background: "rgba(59,201,232,0.07)", border: `1px solid ${C.border}`,
    color: C.text, fontSize: 15, outline: "none",
    boxSizing: "border-box", fontFamily: "inherit",
  });

  return (
    <div style={css({
      minHeight: "100vh", background: C.bg,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontFamily: "'Segoe UI', sans-serif",
    })}>
      <div style={css({
        position: "fixed", top: "-20%", left: "50%", transform: "translateX(-50%)",
        width: 600, height: 600, borderRadius: "50%",
        background: "radial-gradient(circle, rgba(59,201,232,0.12) 0%, transparent 70%)",
        pointerEvents: "none",
      })} />

      <div style={css({ width: "100%", maxWidth: 420, padding: "0 20px" })}>
        <div style={css({ textAlign: "center", marginBottom: 36 })}>
          <div style={css({ fontSize: 36, fontWeight: 800, color: C.accent, letterSpacing: -1 })}>
            🩺 HealNet
          </div>
          <div style={css({ color: C.muted, fontSize: 12, letterSpacing: 3, marginTop: 4 })}>
            PREDICT · PREVENT · PERSONALIZE
          </div>
        </div>

        <Card>
          <div style={css({ display: "flex", gap: 8, marginBottom: 24 })}>
            {["login", "signup"].map(m => (
              <button key={m} onClick={() => { setMode(m); setError(""); }}
                style={css({
                  flex: 1, padding: "10px", borderRadius: 8, border: "none",
                  cursor: "pointer", fontWeight: 600, fontSize: 14,
                  background: mode === m ? C.accent : "rgba(59,201,232,0.08)",
                  color: mode === m ? C.bg : C.muted,
                  transition: "all 0.2s",
                })}>
                {m === "login" ? "Log In" : "Sign Up"}
              </button>
            ))}
          </div>

          <div style={css({ display: "flex", flexDirection: "column", gap: 14 })}>
            {mode === "signup" && (
              <input placeholder="Full Name" value={form.name} onChange={set("name")} style={inputStyle} />
            )}
            <input placeholder="Email Address" type="email" value={form.email} onChange={set("email")} style={inputStyle} />
            <input placeholder="Password" type="password" value={form.password} onChange={set("password")}
              style={inputStyle} onKeyDown={e => e.key === "Enter" && handleSubmit()} />

            {mode === "signup" && (
              <select value={form.kind} onChange={set("kind")} style={inputStyle}>
                <option value="solo">Individual / Patient</option>
                <option value="org">Organisation / Hospital</option>
                <option value="staff">Doctor / Staff</option>
              </select>
            )}

            {error && (
              <div style={css({ color: C.danger, fontSize: 13, textAlign: "center" })}>
                ⚠️ {error}
              </div>
            )}

            <button onClick={handleSubmit} disabled={loading}
              style={css({
                padding: "13px", borderRadius: 10, border: "none",
                background: loading ? "rgba(59,201,232,0.3)" : C.accent,
                color: C.bg, fontWeight: 700, fontSize: 15,
                cursor: loading ? "not-allowed" : "pointer",
                transition: "all 0.2s", marginTop: 4,
              })}>
              {loading ? "Please wait..." : mode === "login" ? "Log In →" : "Create Account →"}
            </button>
          </div>
        </Card>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
//  DASHBOARD
// ═══════════════════════════════════════════════════════════════════
function Dashboard({ user, onLogout }) {
  const [page, setPage]         = useState("overview");
  const [patients, setPatients] = useState([]);
  const [alerts, setAlerts]     = useState([]);
  const [stats, setStats]       = useState(null);
  const [loading, setLoading]   = useState(true);
  const [search, setSearch]     = useState("");
  const [selPatient, setSelPatient] = useState(null);
  const [vitals, setVitals]     = useState([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [pRes, aRes, sRes] = await Promise.all([
        patientsAPI.getAll(),
        alertsAPI.getAll(false),
        alertsAPI.stats(),
      ]);
      setPatients(pRes.data);
      setAlerts(aRes.data);
      setStats(sRes.data);
    } catch (e) { console.error(e); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function openPatient(p) {
    setSelPatient(p);
    setPage("patient");
    try {
      const res = await vitalsAPI.getForPatient(p.patient_id, 15);
      setVitals(res.data.reverse());
    } catch (e) { setVitals([]); }
  }

  async function ackAlert(id) {
    await alertsAPI.acknowledge(id, user.name);
    setAlerts(a => a.map(x => x.id === id ? { ...x, acknowledged: true } : x));
  }

  const filtered = patients.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.patient_id.toLowerCase().includes(search.toLowerCase())
  );

  const navItems = [
    { id: "overview", label: "Overview",        icon: "📊" },
    { id: "patients", label: "Patients",        icon: "👥" },
    { id: "alerts",   label: "Alerts",          icon: "🚨" },
    { id: "vitals",   label: "Add Vitals",      icon: "💓" },
    { id: "ai",       label: "AI Insights",     icon: "🤖" },
    { id: "pupil",    label: "Pupil Detection", icon: "👁"  },
    { id: "camera",   label: "Camera Vitals",   icon: "📷" },
  ];

  return (
    <div style={css({
      minHeight: "100vh", background: C.bg,
      display: "flex", fontFamily: "'Segoe UI', sans-serif", color: C.text,
    })}>
      {/* ── SIDEBAR ─────────────────────────────────────────────── */}
      <div style={css({
        width: 230, background: C.card,
        borderRight: `1px solid ${C.border}`,
        display: "flex", flexDirection: "column",
        padding: "24px 0", position: "sticky",
        top: 0, height: "100vh",
      })}>
        <div style={css({ padding: "0 20px 24px", borderBottom: `1px solid ${C.border}` })}>
          <div style={css({ fontSize: 22, fontWeight: 800, color: C.accent })}>🩺 HealNet</div>
          <div style={css({ color: C.muted, fontSize: 11, marginTop: 2 })}>AI Health Platform</div>
        </div>

        <nav style={css({ padding: "16px 12px", flex: 1, overflowY: "auto" })}>
          {navItems.map(n => (
            <button key={n.id} onClick={() => setPage(n.id)}
              style={css({
                width: "100%", padding: "11px 14px", borderRadius: 10,
                border: "none",
                background: page === n.id ? `${C.accent}22` : "transparent",
                color: page === n.id ? C.accent : C.muted,
                textAlign: "left", cursor: "pointer",
                fontSize: 14, fontWeight: 600, marginBottom: 4,
                display: "flex", alignItems: "center", gap: 10,
                borderLeft: page === n.id ? `3px solid ${C.accent}` : "3px solid transparent",
                transition: "all 0.15s",
              })}>
              {n.icon} {n.label}
              {n.id === "alerts" && stats?.unacknowledged > 0 && (
                <span style={css({
                  marginLeft: "auto", background: C.danger, color: "#fff",
                  borderRadius: "50%", width: 20, height: 20,
                  display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11,
                })}>
                  {stats.unacknowledged}
                </span>
              )}
            </button>
          ))}
        </nav>

        <div style={css({ padding: "16px 20px", borderTop: `1px solid ${C.border}` })}>
          <div style={css({ fontSize: 13, color: C.text, fontWeight: 600 })}>{user.name}</div>
          <div style={css({ fontSize: 11, color: C.muted, marginBottom: 12, textTransform: "capitalize" })}>{user.kind}</div>
          <button onClick={onLogout}
            style={css({
              width: "100%", padding: "8px", borderRadius: 8,
              background: "rgba(255,77,109,0.12)", border: `1px solid ${C.danger}44`,
              color: C.danger, cursor: "pointer", fontSize: 13, fontWeight: 600,
            })}>
            Log Out
          </button>
        </div>
      </div>

      {/* ── MAIN CONTENT ────────────────────────────────────────── */}
      <div style={css({ flex: 1, padding: "32px", overflowY: "auto" })}>
        {loading ? (
          <div style={css({ color: C.muted, textAlign: "center", paddingTop: 80, fontSize: 18 })}>
            Loading HealNet...
          </div>
        ) : (
          <>
            {/* ── OVERVIEW ──────────────────────────────────────── */}
            {page === "overview" && (
              <div>
                <h2 style={css({ margin: "0 0 24px", fontSize: 24 })}>
                  Good day, {user.name} 👋
                </h2>
                <div style={css({ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 16, marginBottom: 28 })}>
                  {[
                    { label: "Total Patients",  value: patients.length,        color: C.accent,  icon: "👥" },
                    { label: "Total Alerts",    value: stats?.total || 0,      color: C.warn,    icon: "🔔" },
                    { label: "Critical",        value: stats?.critical || 0,   color: C.danger,  icon: "🚨" },
                    { label: "Unacknowledged",  value: stats?.unacknowledged || 0, color: C.accent2, icon: "⚠️" },
                  ].map(s => (
                    <Card key={s.label} style={{ borderColor: s.color + "44" }}>
                      <div style={css({ fontSize: 24, marginBottom: 8 })}>{s.icon}</div>
                      <div style={css({ fontSize: 32, fontWeight: 800, color: s.color })}>{s.value}</div>
                      <div style={css({ color: C.muted, fontSize: 13, marginTop: 4 })}>{s.label}</div>
                    </Card>
                  ))}
                </div>
                <Card>
                  <h3 style={css({ margin: "0 0 16px", color: C.accent })}>Recent Patients</h3>
                  {patients.slice(0, 5).map(p => (
                    <div key={p.patient_id} onClick={() => openPatient(p)}
                      style={css({
                        display: "flex", justifyContent: "space-between",
                        alignItems: "center", padding: "12px 0",
                        borderBottom: `1px solid ${C.border}`, cursor: "pointer",
                      })}>
                      <div>
                        <div style={css({ fontWeight: 600 })}>{p.name}</div>
                        <div style={css({ color: C.muted, fontSize: 12 })}>
                          {p.patient_id} · {p.gender} · {p.age} yrs
                        </div>
                      </div>
                      <div style={css({ color: C.accent, fontSize: 13 })}>View →</div>
                    </div>
                  ))}
                  {patients.length === 0 && (
                    <div style={css({ color: C.muted, textAlign: "center", padding: 30 })}>
                      No patients yet. Add your first patient.
                    </div>
                  )}
                </Card>
              </div>
            )}

            {/* ── PATIENTS ──────────────────────────────────────── */}
            {page === "patients" && (
              <div>
                <div style={css({ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 })}>
                  <h2 style={css({ margin: 0, fontSize: 24 })}>Patients</h2>
                  <AddPatientForm onAdded={load} />
                </div>
                <input
                  placeholder="🔍  Search by name or ID..."
                  value={search} onChange={e => setSearch(e.target.value)}
                  style={css({
                    width: "100%", maxWidth: 360, padding: "10px 16px",
                    borderRadius: 10, background: "rgba(59,201,232,0.07)",
                    border: `1px solid ${C.border}`, color: C.text,
                    fontSize: 14, outline: "none", marginBottom: 20,
                    boxSizing: "border-box", fontFamily: "inherit",
                  })}
                />
                <Card style={{ padding: 0 }}>
                  <table style={css({ width: "100%", borderCollapse: "collapse", fontSize: 14 })}>
                    <thead>
                      <tr style={css({ borderBottom: `1px solid ${C.border}` })}>
                        {["ID", "Name", "Age", "Gender", "Blood", "Contact", ""].map(h => (
                          <th key={h} style={css({ padding: "14px 20px", textAlign: "left", color: C.muted, fontWeight: 600, fontSize: 12 })}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map(p => (
                        <tr key={p.patient_id} style={css({ borderBottom: `1px solid ${C.border}44` })}>
                          <td style={css({ padding: "13px 20px", color: C.accent, fontFamily: "monospace" })}>{p.patient_id}</td>
                          <td style={css({ padding: "13px 20px", fontWeight: 600 })}>{p.name}</td>
                          <td style={css({ padding: "13px 20px", color: C.muted })}>{p.age}</td>
                          <td style={css({ padding: "13px 20px", color: C.muted })}>{p.gender}</td>
                          <td style={css({ padding: "13px 20px" })}><Badge label={p.blood_group || "?"} color={C.accent} /></td>
                          <td style={css({ padding: "13px 20px", color: C.muted })}>{p.contact}</td>
                          <td style={css({ padding: "13px 20px" })}>
                            <button onClick={() => openPatient(p)}
                              style={css({
                                padding: "6px 14px", borderRadius: 6,
                                border: `1px solid ${C.accent}`,
                                background: "transparent", color: C.accent,
                                cursor: "pointer", fontSize: 12,
                              })}>
                              View
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {filtered.length === 0 && (
                    <div style={css({ color: C.muted, textAlign: "center", padding: 40 })}>
                      No patients found.
                    </div>
                  )}
                </Card>
              </div>
            )}

            {/* ── PATIENT DETAIL ────────────────────────────────── */}
            {page === "patient" && selPatient && (
              <div>
                <button onClick={() => setPage("patients")}
                  style={css({ background: "none", border: "none", color: C.accent, cursor: "pointer", fontSize: 14, marginBottom: 20 })}>
                  ← Back to Patients
                </button>
                <div style={css({ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 20, marginBottom: 20 })}>
                  <Card>
                    <h3 style={css({ margin: "0 0 16px", color: C.accent })}>Patient Info</h3>
                    {[
                      ["ID",        selPatient.patient_id],
                      ["Name",      selPatient.name],
                      ["Age",       selPatient.age],
                      ["Gender",    selPatient.gender],
                      ["Blood",     selPatient.blood_group],
                      ["Contact",   selPatient.contact],
                      ["Email",     selPatient.email],
                      ["Allergies", selPatient.allergies],
                    ].map(([k, v]) => v ? (
                      <div key={k} style={css({ marginBottom: 10 })}>
                        <div style={css({ color: C.muted, fontSize: 11, marginBottom: 2 })}>{k.toUpperCase()}</div>
                        <div style={css({ fontWeight: 500 })}>{v}</div>
                      </div>
                    ) : null)}
                  </Card>
                  <Card>
                    <h3 style={css({ margin: "0 0 16px", color: C.accent })}>Vitals History</h3>
                    {vitals.length > 0 ? (
                      <>
                        <ResponsiveContainer width="100%" height={200}>
                          <LineChart data={vitals}>
                            <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
                            <XAxis dataKey="recorded_at" tickFormatter={v => new Date(v).toLocaleDateString()} stroke={C.muted} tick={{ fontSize: 10 }} />
                            <YAxis stroke={C.muted} tick={{ fontSize: 10 }} />
                            <Tooltip contentStyle={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8 }} />
                            <Line type="monotone" dataKey="heart_rate"  stroke={C.danger}  dot={false} name="HR"   strokeWidth={2} />
                            <Line type="monotone" dataKey="spo2"        stroke={C.accent2} dot={false} name="SpO2" strokeWidth={2} />
                            <Line type="monotone" dataKey="systolic_bp" stroke={C.accent}  dot={false} name="BP"   strokeWidth={2} />
                          </LineChart>
                        </ResponsiveContainer>
                        {(() => {
                          const last = vitals[vitals.length - 1];
                          return (
                            <div style={css({ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginTop: 16 })}>
                              {[
                                ["❤️ HR",   last.heart_rate,   "bpm"],
                                ["🫁 SpO2", last.spo2,         "%"],
                                ["🌡️ Temp", last.temperature,  "°C"],
                                ["💉 BP",   last.systolic_bp ? `${last.systolic_bp}/${last.diastolic_bp}` : null, "mmHg"],
                              ].map(([label, val, unit]) => val ? (
                                <div key={label} style={css({ background: "rgba(59,201,232,0.07)", borderRadius: 10, padding: 12, textAlign: "center" })}>
                                  <div style={css({ fontSize: 11, color: C.muted })}>{label}</div>
                                  <div style={css({ fontSize: 22, fontWeight: 800, color: C.accent })}>{val}</div>
                                  <div style={css({ fontSize: 11, color: C.muted })}>{unit}</div>
                                </div>
                              ) : null)}
                            </div>
                          );
                        })()}
                      </>
                    ) : (
                      <div style={css({ color: C.muted, textAlign: "center", padding: 40 })}>No vitals recorded yet.</div>
                    )}
                  </Card>
                </div>
                <AddVitalForm patientId={selPatient.patient_id} onAdded={() => openPatient(selPatient)} />
                <div style={css({ marginTop: 20 })}>
                  <AIPanel patientId={selPatient.patient_id} />
                </div>
              </div>
            )}

            {/* ── ALERTS ────────────────────────────────────────── */}
            {page === "alerts" && (
              <div>
                <h2 style={css({ margin: "0 0 24px", fontSize: 24 })}>Alerts</h2>
                <div style={css({ display: "flex", flexDirection: "column", gap: 12 })}>
                  {alerts.map(a => (
                    <Card key={a.id} style={{ borderColor: a.category === "Critical" ? C.danger + "66" : C.warn + "66" }}>
                      <div style={css({ display: "flex", justifyContent: "space-between", alignItems: "flex-start" })}>
                        <div>
                          <div style={css({ display: "flex", gap: 8, marginBottom: 6 })}>
                            <Badge label={a.category} color={a.category === "Critical" ? C.danger : C.warn} />
                            {a.acknowledged && <Badge label="Acknowledged" color={C.accent2} />}
                          </div>
                          <div style={css({ fontWeight: 600, marginBottom: 4 })}>{a.message}</div>
                          <div style={css({ color: C.muted, fontSize: 12 })}>
                            Patient: {a.patient_name || a.patient_id} · {new Date(a.recorded_at).toLocaleString()}
                          </div>
                        </div>
                        {!a.acknowledged && (
                          <button onClick={() => ackAlert(a.id)}
                            style={css({
                              padding: "7px 16px", borderRadius: 8,
                              border: `1px solid ${C.accent2}`,
                              background: "transparent", color: C.accent2,
                              cursor: "pointer", fontSize: 13, whiteSpace: "nowrap",
                            })}>
                            ✓ Acknowledge
                          </button>
                        )}
                      </div>
                    </Card>
                  ))}
                  {alerts.length === 0 && (
                    <div style={css({ color: C.muted, textAlign: "center", padding: 60, fontSize: 16 })}>
                      ✅ No alerts — all clear!
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ── ADD VITALS ────────────────────────────────────── */}
            {page === "vitals" && (
              <div>
                <h2 style={css({ margin: "0 0 24px", fontSize: 24 })}>Record Vitals</h2>
                <Card style={{ maxWidth: 620 }}>
                  <QuickVitalForm patients={patients} onAdded={load} />
                </Card>
              </div>
            )}

            {/* ── AI INSIGHTS ───────────────────────────────────── */}
            {page === "ai" && (
              <div>
                <h2 style={css({ margin: "0 0 24px", fontSize: 24 })}>🤖 AI Insights</h2>
                <div style={css({ marginBottom: 20 })}>
                  <select
                    onChange={e => setSelPatient(patients.find(p => p.patient_id === e.target.value) || null)}
                    style={css({
                      padding: "10px 16px", borderRadius: 10,
                      background: "rgba(59,201,232,0.07)", border: `1px solid ${C.border}`,
                      color: C.text, fontSize: 14, outline: "none", minWidth: 280,
                    })}>
                    <option value="">— Select a patient —</option>
                    {patients.map(p => (
                      <option key={p.patient_id} value={p.patient_id}>{p.name} ({p.patient_id})</option>
                    ))}
                  </select>
                </div>
                {selPatient
                  ? <AIPanel patientId={selPatient.patient_id} />
                  : <div style={css({ color: C.muted, textAlign: "center", padding: 60 })}>Select a patient to view AI analysis</div>
                }
              </div>
            )}

            {/* ── PUPIL DETECTION ───────────────────────────────── */}
            {page === "pupil" && <PupilPage />}

            {/* ── CAMERA VITALS ─────────────────────────────────── */}
            {page === "camera" && <CameraPage />}
          </>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
//  FORMS
// ═══════════════════════════════════════════════════════════════════
function AddPatientForm({ onAdded }) {
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
      setOpen(false);
      onAdded();
      setForm({ patient_id:"", name:"", age:"", gender:"Male", blood_group:"", contact:"", email:"" });
    } catch (e) {
      setMsg(e.response?.data?.detail || "Error saving patient");
    }
    setLoading(false);
  }

  const inputS = css({
    width: "100%", padding: "10px 14px", borderRadius: 8,
    background: "rgba(59,201,232,0.07)", border: `1px solid ${C.border}`,
    color: C.text, fontSize: 14, outline: "none",
    boxSizing: "border-box", fontFamily: "inherit",
  });

  if (!open) return (
    <button onClick={() => setOpen(true)}
      style={css({
        padding: "10px 20px", borderRadius: 10, border: "none",
        background: C.accent, color: C.bg, fontWeight: 700, cursor: "pointer",
      })}>
      + Add Patient
    </button>
  );

  return (
    <div style={css({
      position: "fixed", inset: 0, background: "rgba(3,12,44,0.85)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100,
    })}>
      <div style={css({
        background: C.card, border: `1px solid ${C.border}`,
        borderRadius: 16, padding: 28, width: "100%", maxWidth: 500,
      })}>
        <h3 style={css({ margin: "0 0 20px", color: C.accent })}>New Patient</h3>
        <div style={css({ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 })}>
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
        {msg && <div style={css({ color: C.danger, fontSize: 13, marginTop: 10 })}>{msg}</div>}
        <div style={css({ display: "flex", gap: 10, marginTop: 16 })}>
          <button onClick={save} disabled={loading}
            style={css({ flex: 1, padding: "11px", borderRadius: 8, border: "none", background: C.accent, color: C.bg, fontWeight: 700, cursor: "pointer" })}>
            {loading ? "Saving..." : "Save Patient"}
          </button>
          <button onClick={() => setOpen(false)}
            style={css({ flex: 1, padding: "11px", borderRadius: 8, border: `1px solid ${C.border}`, background: "none", color: C.muted, cursor: "pointer" })}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function AddVitalForm({ patientId, onAdded }) {
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

  const inputS = css({
    width: "100%", padding: "10px 14px", borderRadius: 8,
    background: "rgba(59,201,232,0.07)", border: `1px solid ${C.border}`,
    color: C.text, fontSize: 14, outline: "none",
    boxSizing: "border-box", fontFamily: "inherit",
  });

  return (
    <div style={css({ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 24 })}>
      <h3 style={css({ margin: "0 0 16px", color: C.accent })}>Record Vitals</h3>
      <div style={css({ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12 })}>
        {[
          ["heart_rate",   "Heart Rate (bpm)"],
          ["spo2",         "SpO2 (%)"],
          ["systolic_bp",  "Systolic BP"],
          ["diastolic_bp", "Diastolic BP"],
          ["temperature",  "Temperature (°C)"],
          ["blood_sugar",  "Blood Sugar"],
        ].map(([k, ph]) => (
          <div key={k}>
            <div style={css({ color: C.muted, fontSize: 11, marginBottom: 4 })}>{ph}</div>
            <input type="number" placeholder="—" value={form[k]} onChange={set(k)} style={inputS} />
          </div>
        ))}
      </div>
      {msg && <div style={css({ marginTop: 10, fontSize: 13, color: msg.startsWith("✅") ? C.accent2 : C.danger })}>{msg}</div>}
      <button onClick={save} disabled={loading}
        style={css({ marginTop: 16, padding: "11px 28px", borderRadius: 8, border: "none", background: C.accent, color: C.bg, fontWeight: 700, cursor: "pointer" })}>
        {loading ? "Saving..." : "Save Vitals"}
      </button>
    </div>
  );
}

function QuickVitalForm({ patients, onAdded }) {
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

  const inputS = css({
    width: "100%", padding: "10px 14px", borderRadius: 8,
    background: "rgba(59,201,232,0.07)", border: `1px solid ${C.border}`,
    color: C.text, fontSize: 14, outline: "none",
    boxSizing: "border-box", fontFamily: "inherit",
  });

  return (
    <div>
      <select value={pid} onChange={e => setPid(e.target.value)} style={{ ...inputS, marginBottom: 16 }}>
        <option value="">Select Patient</option>
        {patients.map(p => <option key={p.patient_id} value={p.patient_id}>{p.name} ({p.patient_id})</option>)}
      </select>
      <div style={css({ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12 })}>
        {[
          ["heart_rate",   "Heart Rate (bpm)"],
          ["spo2",         "SpO2 (%)"],
          ["systolic_bp",  "Systolic BP"],
          ["diastolic_bp", "Diastolic BP"],
          ["temperature",  "Temperature (°C)"],
          ["blood_sugar",  "Blood Sugar"],
        ].map(([k, ph]) => (
          <div key={k}>
            <div style={css({ color: C.muted, fontSize: 11, marginBottom: 4 })}>{ph}</div>
            <input type="number" placeholder="—" value={form[k]} onChange={set(k)} style={inputS} />
          </div>
        ))}
      </div>
      {msg && <div style={css({ marginTop: 10, fontSize: 13, color: msg.startsWith("✅") ? C.accent2 : C.danger })}>{msg}</div>}
      <button onClick={save} disabled={loading}
        style={css({ marginTop: 16, padding: "11px 28px", borderRadius: 8, border: "none", background: C.accent, color: C.bg, fontWeight: 700, cursor: "pointer" })}>
        {loading ? "Saving..." : "Save Vitals"}
      </button>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
//  ROOT APP
// ═══════════════════════════════════════════════════════════════════
export default function App() {
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem("healnet_user")); }
    catch { return null; }
  });

  function handleLogin(u)  { setUser(u); }
  function handleLogout()  {
    localStorage.removeItem("healnet_token");
    localStorage.removeItem("healnet_user");
    setUser(null);
  }

  if (!user) return <LoginPage onLogin={handleLogin} />;
  return <Dashboard user={user} onLogout={handleLogout} />;
}
