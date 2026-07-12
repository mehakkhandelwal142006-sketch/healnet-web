/**
 * OfflineBanner.jsx
 * ───────────────────────────────────────────────────────────────────
 * Renders a sticky status bar at the top of the app when offline,
 * or a brief "back online / syncing" toast when reconnected.
 *
 * Props:
 *   isOnline      boolean
 *   syncing       boolean
 *   pendingCount  number
 *   lastSyncedAt  number | null  (timestamp)
 *   onSync        () => void
 *
 * The banner is visually zero-height when online and not syncing,
 * so it never shifts layout.
 * ───────────────────────────────────────────────────────────────────
 */

import { useState, useEffect } from "react";
import { timeAgo } from "./offlineStore";

const C = {
  bg:      "#030c2c",
  accent:  "#3BC9E8",
  accent2: "#00f5a0",
  danger:  "#ff4d6d",
  warn:    "#ffd166",
  text:    "#e8f4f8",
  muted:   "rgba(232,244,248,0.55)",
};

export function OfflineBanner({ isOnline, syncing, pendingCount, lastSyncedAt, onSync }) {
  const [showToast, setShowToast] = useState(false);
  const [prevOnline, setPrevOnline] = useState(isOnline);

  // Show a "Back online" toast for 4 seconds after reconnecting
  useEffect(() => {
    if (!prevOnline && isOnline) {
      setShowToast(true);
      const t = setTimeout(() => setShowToast(false), 4000);
      setPrevOnline(true);
      return () => clearTimeout(t);
    }
    if (!isOnline) setPrevOnline(false);
  }, [isOnline, prevOnline]);

  // ── Offline bar ──────────────────────────────────────────────
  if (!isOnline) {
    return (
      <div style={{
        position:   "sticky",
        top:        0,
        zIndex:     1000,
        background: `linear-gradient(90deg, ${C.danger}22, rgba(255,77,109,0.12))`,
        borderBottom: `1px solid ${C.danger}55`,
        backdropFilter: "blur(8px)",
        padding:    "10px 20px",
        display:    "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap:        12,
        flexWrap:   "wrap",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 18 }}>📵</span>
          <div>
            <div style={{ color: C.danger, fontWeight: 700, fontSize: 13 }}>
              You're offline
            </div>
            <div style={{ color: C.muted, fontSize: 11, marginTop: 1 }}>
              Viewing cached data.
              {pendingCount > 0
                ? ` ${pendingCount} vital${pendingCount > 1 ? "s" : ""} waiting to sync.`
                : " New vitals will queue and sync when you reconnect."}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
          {lastSyncedAt && (
            <span style={{ fontSize: 11, color: C.muted }}>
              Last sync: {timeAgo(lastSyncedAt)}
            </span>
          )}
          {pendingCount > 0 && (
            <span style={{
              background: C.danger + "33",
              border:     `1px solid ${C.danger}66`,
              color:      C.danger,
              borderRadius: 20,
              padding:    "2px 10px",
              fontSize:   11,
              fontWeight: 700,
            }}>
              {pendingCount} pending
            </span>
          )}
        </div>
      </div>
    );
  }

  // ── Syncing bar (online but still flushing queue) ─────────────
  if (syncing) {
    return (
      <div style={{
        position:   "sticky",
        top:        0,
        zIndex:     1000,
        background: `linear-gradient(90deg, ${C.accent}18, rgba(59,201,232,0.08))`,
        borderBottom: `1px solid ${C.accent}44`,
        backdropFilter: "blur(8px)",
        padding:    "8px 20px",
        display:    "flex",
        alignItems: "center",
        gap:        10,
      }}>
        <span style={{ fontSize: 16, animation: "spin 1s linear infinite", display: "inline-block" }}>⟳</span>
        <span style={{ color: C.accent, fontSize: 12, fontWeight: 600 }}>
          Syncing {pendingCount} queued vital{pendingCount > 1 ? "s" : ""}…
        </span>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    );
  }

  // ── "Back online" toast ───────────────────────────────────────
  if (showToast) {
    return (
      <div style={{
        position:   "sticky",
        top:        0,
        zIndex:     1000,
        background: `linear-gradient(90deg, ${C.accent2}18, rgba(0,245,160,0.06))`,
        borderBottom: `1px solid ${C.accent2}44`,
        backdropFilter: "blur(8px)",
        padding:    "8px 20px",
        display:    "flex",
        alignItems: "center",
        gap:        10,
      }}>
        <span style={{ fontSize: 16 }}>✅</span>
        <span style={{ color: C.accent2, fontSize: 12, fontWeight: 600 }}>
          Back online — all data synced.
        </span>
      </div>
    );
  }

  // ── Online, nothing to show ───────────────────────────────────
  return null;
}


/**
 * NetworkTestToggle
 * ─────────────────────────────────────────────────────────────────
 * Small floating dev/test control that lets you force the app into
 * "offline" mode without actually disconnecting your network —
 * useful for testing the offline banner/sync flow on demand.
 *
 * Props:
 *   forceOffline     boolean
 *   setForceOffline  (boolean) => void
 */
export function NetworkTestToggle({ forceOffline, setForceOffline }) {
  return (
    <button
      onClick={() => setForceOffline(!forceOffline)}
      title="Toggle simulated offline mode (testing only)"
      style={{
        position:   "fixed",
        bottom:     16,
        right:      16,
        zIndex:     999,
        background: forceOffline ? C.danger + "22" : "rgba(59,201,232,0.12)",
        border:     `1px solid ${forceOffline ? C.danger : C.accent}55`,
        color:      forceOffline ? C.danger : C.accent,
        borderRadius: 20,
        padding:    "6px 14px",
        fontSize:   11,
        fontWeight: 700,
        cursor:     "pointer",
        backdropFilter: "blur(6px)",
      }}
    >
      {forceOffline ? "📵 Forced Offline" : "🧪 Test Offline"}
    </button>
  );
}


/**
 * OfflineDataBadge
 * ─────────────────────────────────────────────────────────────────
 * Small inline badge that says "Cached • Xm ago" next to any
 * heading when the data shown is from cache.
 *
 * Props:
 *   savedAt  number (timestamp) | null
 *   isOnline boolean
 */
export function OfflineDataBadge({ savedAt, isOnline }) {
  if (!savedAt) return null;
  if (isOnline && (Date.now() - savedAt < 60_000)) return null; // fresh — no badge needed

  return (
    <span style={{
      display:    "inline-flex",
      alignItems: "center",
      gap:        4,
      background: "rgba(255,209,102,0.12)",
      border:     "1px solid rgba(255,209,102,0.35)",
      borderRadius: 20,
      padding:    "2px 9px",
      fontSize:   10,
      color:      C.warn,
      fontWeight: 600,
      marginLeft: 8,
      verticalAlign: "middle",
      letterSpacing: 0.3,
    }}>
      💾 Cached · {timeAgo(savedAt)}
    </span>
  );
}