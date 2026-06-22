/**
 * useNetwork.js
 * ───────────────────────────────────────────────────────────────────
 * React hook that:
 *   1. Tracks online / offline status reactively
 *   2. Auto-syncs pending vitals queue when the network comes back
 *   3. Returns { isOnline, syncing, lastSyncedAt, pendingCount,
 *                syncNow, forcePoll }
 *
 * Usage:
 *   const { isOnline, pendingCount, syncNow } = useNetwork();
 * ───────────────────────────────────────────────────────────────────
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { vitalsAPI } from "../services/api";
import {
  getPendingVitals,
  removePendingVital,
  pendingCount as storePendingCount,
} from "./offlineStore";

export function useNetwork() {
  const [isOnline, setIsOnline]       = useState(() => navigator.onLine);
  const [syncing, setSyncing]         = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState(null);
  const [pending, setPending]         = useState(storePendingCount);

  // Keep pending count reactive: re-read from localStorage periodically
  const refreshPending = useCallback(() => {
    setPending(storePendingCount());
  }, []);

  // ── Auto-sync logic ────────────────────────────────────────────
  const syncPending = useCallback(async () => {
    const queue = getPendingVitals();
    if (!queue.length || syncing) return { synced: 0, failed: 0 };

    setSyncing(true);
    let synced = 0, failed = 0;

    for (const entry of queue) {
      try {
        await vitalsAPI.record({
          patient_id: entry.patientId,
          ...entry.payload,
        });
        removePendingVital(entry.id);
        synced++;
      } catch {
        failed++;
      }
    }

    setSyncing(false);
    setLastSyncedAt(Date.now());
    refreshPending();
    return { synced, failed };
  }, [syncing, refreshPending]);

  // ── Event listeners ────────────────────────────────────────────
  useEffect(() => {
    const goOnline = () => {
      setIsOnline(true);
      // Small delay so the network stack is actually ready
      setTimeout(() => syncPending(), 1200);
    };
    const goOffline = () => setIsOnline(false);

    window.addEventListener("online",  goOnline);
    window.addEventListener("offline", goOffline);

    // Expose a global event so other components can trigger a pending-count refresh
    window.addEventListener("healnet_vitals_queued", refreshPending);

    return () => {
      window.removeEventListener("online",  goOnline);
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("healnet_vitals_queued", refreshPending);
    };
  }, [syncPending, refreshPending]);

  // Refresh pending count on mount (in case the page was just loaded)
  useEffect(() => { refreshPending(); }, [refreshPending]);

  return {
    isOnline,
    syncing,
    lastSyncedAt,
    pendingCount: pending,
    /** Manually trigger sync (e.g. "Retry" button) */
    syncNow: syncPending,
    /** Re-read pending count (call after enqueueing) */
    refreshPending,
  };
}
