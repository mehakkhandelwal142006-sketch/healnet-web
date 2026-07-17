import { useState, useEffect, useRef } from "react";
import QRCode from "qrcode";
import jsQR from "jsqr";
import { healthScoreAPI, patientSharesAPI } from "../services/api";

const C = {
  bg: "#030c2c", card: "#04163c", border: "rgba(59,201,232,0.18)",
  accent: "#3BC9E8", accent2: "#00f5a0", danger: "#ff4d6d",
  warn: "#ffd166", text: "#e8f4f8", muted: "rgba(232,244,248,0.5)",
};

function gradeColor(grade) {
  return {
    Excellent: C.accent2,
    Good:      C.accent,
    Fair:      C.warn,
    Poor:      "#f97316",
    Critical:  C.danger,
  }[grade] || C.muted;
}

function roleTag(age) {
  if (age == null) return { label: "Member", color: C.muted };
  if (age < 18)  return { label: "Child",    color: C.accent2 };
  if (age >= 60) return { label: "Elderly",  color: C.warn };
  return { label: "Adult", color: C.accent };
}

// ── Share modal: generates a QR code + text code for a patient ─────
function ShareModal({ patient, onClose }) {
  const [token, setToken] = useState(null);
  const [expiresAt, setExpiresAt] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const canvasRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await patientSharesAPI.createShare(patient.patient_id);
        if (cancelled) return;
        setToken(res.data.token);
        setExpiresAt(res.data.expires_at);
      } catch (e) {
        if (!cancelled) setError(e.response?.data?.detail || "Could not generate share code");
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [patient.patient_id]);

  useEffect(() => {
    if (token && canvasRef.current) {
      QRCode.toCanvas(canvasRef.current, token, { width: 220, margin: 2 }, () => {});
    }
  }, [token]);

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 20,
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        background: C.card, border: `1px solid ${C.border}`, borderRadius: 16,
        padding: 24, maxWidth: 340, width: "100%", textAlign: "center",
      }}>
        <h3 style={{ margin: "0 0 4px", color: C.text, fontSize: 17 }}>Share {patient.name}</h3>
        <p style={{ color: C.muted, fontSize: 12, marginBottom: 16 }}>
          Have a family member scan this code to get full access to {patient.name}'s records.
        </p>

        {loading && <div style={{ color: C.muted, padding: 40 }}>Generating code...</div>}
        {error && <div style={{ color: C.danger, fontSize: 13, padding: 20 }}>⚠️ {error}</div>}

        {token && (
          <>
            <canvas ref={canvasRef} style={{ borderRadius: 12, marginBottom: 12 }} />
            <div style={{
              background: "rgba(59,201,232,0.08)", borderRadius: 8, padding: "8px 12px",
              fontFamily: "monospace", fontSize: 13, color: C.accent, letterSpacing: 1,
              wordBreak: "break-all", marginBottom: 8,
            }}>
              {token}
            </div>
            <div style={{ fontSize: 11, color: C.muted, marginBottom: 16 }}>
              Expires {new Date(expiresAt).toLocaleString()} — one-time use
            </div>
          </>
        )}

        <button onClick={onClose} style={{
          width: "100%", padding: "10px", borderRadius: 10, border: `1px solid ${C.border}`,
          background: "none", color: C.muted, cursor: "pointer", fontSize: 14,
        }}>
          Close
        </button>
      </div>
    </div>
  );
}

// ── Link modal: capture a photo of a QR code and redeem it ─────────
function LinkModal({ onClose, onLinked }) {
  const [status, setStatus] = useState("idle"); // idle | decoding | linking | success | error
  const [error, setError] = useState("");
  const [manualCode, setManualCode] = useState("");
  const [linkedName, setLinkedName] = useState("");
  const fileInputRef = useRef(null);

  async function redeemToken(token) {
    setStatus("linking"); setError("");
    try {
      const res = await patientSharesAPI.redeem(token.trim());
      setLinkedName(res.data.patient?.name || "Patient");
      setStatus("success");
      onLinked && onLinked();
    } catch (e) {
      setError(e.response?.data?.detail || "Could not link — check the code and try again.");
      setStatus("error");
    }
  }

  function handlePhoto(e) {
    const file = e.target.files[0];
    if (!file) return;
    setStatus("decoding"); setError("");

    const img = new Image();
    const reader = new FileReader();
    reader.onload = (ev) => {
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height);
        if (code && code.data) {
          redeemToken(code.data);
        } else {
          setError("Couldn't read a QR code in that photo. Try again with better lighting, or enter the code manually below.");
          setStatus("error");
        }
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 20,
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        background: C.card, border: `1px solid ${C.border}`, borderRadius: 16,
        padding: 24, maxWidth: 340, width: "100%", textAlign: "center",
      }}>
        <h3 style={{ margin: "0 0 4px", color: C.text, fontSize: 17 }}>Link a Family Member's Patient</h3>

        {status === "success" ? (
          <>
            <div style={{ fontSize: 32, margin: "16px 0" }}>✅</div>
            <div style={{ color: C.accent2, fontSize: 14, marginBottom: 16 }}>
              Linked to {linkedName} — you now have full access.
            </div>
          </>
        ) : (
          <>
            <p style={{ color: C.muted, fontSize: 12, marginBottom: 16 }}>
              Take a photo of the QR code shown on the other person's phone.
            </p>

            <input ref={fileInputRef} type="file" accept="image/*" capture="environment"
              onChange={handlePhoto} style={{ display: "none" }} id="qr-photo-input" />
            <label htmlFor="qr-photo-input" style={{
              display: "block", padding: "14px", borderRadius: 10,
              border: `2px dashed ${C.border}`, color: C.accent, cursor: "pointer",
              fontSize: 13, fontWeight: 600, marginBottom: 16,
            }}>
              {status === "decoding" || status === "linking" ? "Processing..." : "📷 Take Photo of QR Code"}
            </label>

            <div style={{ fontSize: 11, color: C.muted, margin: "12px 0" }}>— or enter the code manually —</div>
            <input value={manualCode} onChange={e => setManualCode(e.target.value)}
              placeholder="Paste share code here"
              style={{
                width: "100%", padding: "10px", borderRadius: 8, marginBottom: 10,
                background: "rgba(59,201,232,0.07)", border: `1px solid ${C.border}`,
                color: C.text, fontSize: 13, boxSizing: "border-box", fontFamily: "monospace",
              }} />
            <button onClick={() => manualCode && redeemToken(manualCode)}
              disabled={!manualCode || status === "linking"}
              style={{
                width: "100%", padding: "10px", borderRadius: 8, border: "none",
                background: C.accent, color: C.bg, fontWeight: 700, cursor: "pointer",
                marginBottom: 12, opacity: !manualCode ? 0.5 : 1,
              }}>
              Link with Code
            </button>

            {error && <div style={{ color: C.danger, fontSize: 12, marginBottom: 12 }}>⚠️ {error}</div>}
          </>
        )}

        <button onClick={onClose} style={{
          width: "100%", padding: "10px", borderRadius: 10, border: `1px solid ${C.border}`,
          background: "none", color: C.muted, cursor: "pointer", fontSize: 14,
        }}>
          {status === "success" ? "Done" : "Cancel"}
        </button>
      </div>
    </div>
  );
}

function MemberCard({ patient, onOpen, onShare }) {
  const [score, setScore]   = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await healthScoreAPI.getScore(patient.patient_id);
        if (!cancelled) setScore(res.data);
      } catch {
        if (!cancelled) setScore(null);
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [patient.patient_id]);

  const role = roleTag(patient.age);
  const color = score ? gradeColor(score.grade) : C.muted;

  return (
    <div style={{
      background: C.card, border: `1px solid ${C.border}`,
      borderLeft: `4px solid ${color}`,
      borderRadius: 14, padding: 18,
      marginBottom: 12,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div onClick={() => onOpen(patient)} style={{ cursor: "pointer", flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
            <span style={{ fontSize: 16, fontWeight: 700, color: C.text }}>{patient.name}</span>
            <span style={{
              background: role.color + "22", color: role.color,
              border: `1px solid ${role.color}44`, borderRadius: 6,
              padding: "1px 8px", fontSize: 10, fontWeight: 700,
            }}>
              {role.label}
            </span>
            {patient.access === "shared" && (
              <span style={{
                background: C.accent2 + "22", color: C.accent2,
                border: `1px solid ${C.accent2}44`, borderRadius: 6,
                padding: "1px 8px", fontSize: 10, fontWeight: 700,
              }}>
                🔗 Shared with you
              </span>
            )}
          </div>
          <div style={{ color: C.muted, fontSize: 12 }}>
            {patient.patient_id} · {patient.gender || "—"} · {patient.age ?? "—"} yrs
          </div>
        </div>

        <div style={{ textAlign: "right", cursor: "pointer" }} onClick={() => onOpen(patient)}>
          {loading ? (
            <div style={{ color: C.muted, fontSize: 12 }}>Loading...</div>
          ) : score ? (
            <>
              <div style={{ fontSize: 26, fontWeight: 800, color }}>{score.total}</div>
              <div style={{ fontSize: 11, color, fontWeight: 600 }}>{score.grade}</div>
            </>
          ) : (
            <div style={{ color: C.muted, fontSize: 12 }}>No score yet</div>
          )}
        </div>
      </div>

      {patient.access !== "shared" && (
        <button onClick={() => onShare(patient)} style={{
          marginTop: 10, padding: "6px 12px", borderRadius: 8, border: `1px solid ${C.border}`,
          background: "none", color: C.accent, cursor: "pointer", fontSize: 12, fontWeight: 600,
        }}>
          🔗 Share with family member
        </button>
      )}
    </div>
  );
}

export default function FamilyDashboardPage({ patients, onOpenPatient, onLinked }) {
  const [filter, setFilter] = useState("all");
  const [shareTarget, setShareTarget] = useState(null);
  const [linkModalOpen, setLinkModalOpen] = useState(false);

  const filtered = (patients || []).filter(p => {
    if (filter === "all") return true;
    const role = roleTag(p.age).label.toLowerCase();
    return role === filter;
  });

  const counts = {
    all:     (patients || []).length,
    child:   (patients || []).filter(p => roleTag(p.age).label === "Child").length,
    adult:   (patients || []).filter(p => roleTag(p.age).label === "Adult").length,
    elderly: (patients || []).filter(p => roleTag(p.age).label === "Elderly").length,
  };

  return (
    <div style={{ fontFamily: "'Segoe UI', sans-serif", color: C.text }}>
      <h2 style={{ margin: "0 0 6px", fontSize: 22 }}>👨‍👩‍👧‍👦 Family Health Dashboard</h2>
      <p style={{ color: C.muted, fontSize: 14, marginBottom: 20 }}>
        One view for all family members — parents, children, and elderly relatives you monitor.
      </p>

      <button onClick={() => setLinkModalOpen(true)} style={{
        width: "100%", padding: "12px", borderRadius: 10, border: "none",
        background: C.accent, color: C.bg, fontWeight: 700, cursor: "pointer",
        fontSize: 14, marginBottom: 20,
      }}>
        📷 Link a Family Member's Patient (Scan QR)
      </button>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 20 }}>
        {[
          { id: "all",     label: `All (${counts.all})` },
          { id: "child",   label: `👶 Child (${counts.child})` },
          { id: "adult",   label: `🧑 Adult (${counts.adult})` },
          { id: "elderly", label: `🧓 Elderly (${counts.elderly})` },
        ].map(f => (
          <button key={f.id} onClick={() => setFilter(f.id)}
            style={{
              padding: "6px 14px", borderRadius: 8, border: "none",
              background: filter === f.id ? C.accent : "rgba(59,201,232,0.08)",
              color: filter === f.id ? C.bg : C.muted,
              fontWeight: 600, fontSize: 12, cursor: "pointer",
            }}>
            {f.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div style={{ color: C.muted, textAlign: "center", padding: 60 }}>
          No family members in this category yet.
        </div>
      ) : (
        filtered.map(p => (
          <MemberCard key={p.patient_id} patient={p} onOpen={onOpenPatient} onShare={setShareTarget} />
        ))
      )}

      {shareTarget && <ShareModal patient={shareTarget} onClose={() => setShareTarget(null)} />}
      {linkModalOpen && (
        <LinkModal
          onClose={() => setLinkModalOpen(false)}
          onLinked={onLinked}
        />
      )}
    </div>
  );
}