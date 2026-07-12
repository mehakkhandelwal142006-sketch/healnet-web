import { useState, useEffect } from "react";
import { healthScoreAPI } from "../services/api";

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

function MemberCard({ patient, onOpen }) {
  const [score, setScore]   = useState(null);
  const [alertCount, setAlertCount] = useState(null);
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
    <div onClick={() => onOpen(patient)}
      style={{
        background: C.card, border: `1px solid ${C.border}`,
        borderLeft: `4px solid ${color}`,
        borderRadius: 14, padding: 18, cursor: "pointer",
        display: "flex", justifyContent: "space-between", alignItems: "center",
        marginBottom: 12,
      }}>
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
          <span style={{ fontSize: 16, fontWeight: 700, color: C.text }}>{patient.name}</span>
          <span style={{
            background: role.color + "22", color: role.color,
            border: `1px solid ${role.color}44`, borderRadius: 6,
            padding: "1px 8px", fontSize: 10, fontWeight: 700,
          }}>
            {role.label}
          </span>
        </div>
        <div style={{ color: C.muted, fontSize: 12 }}>
          {patient.patient_id} · {patient.gender || "—"} · {patient.age ?? "—"} yrs
        </div>
      </div>

      <div style={{ textAlign: "right" }}>
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
  );
}

export default function FamilyDashboardPage({ patients, onOpenPatient }) {
  const [filter, setFilter] = useState("all");

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
          <MemberCard key={p.patient_id} patient={p} onOpen={onOpenPatient} />
        ))
      )}
    </div>
  );
}
