import { useEffect } from "react";
import { subscribeWsStatus } from "@plugins/primitives/plugins/networking/web";
import { getNotificationsClient } from "@plugins/primitives/plugins/live-state/web";
import { ShellCommands } from "@plugins/shell/web";
import { report } from "@plugins/crashes/web";

// How long a socket may stay non-open before we declare the live-state pipeline
// wedged. A transient reconnect self-heals well within this window via sub-ack;
// only a truly stuck socket survives it.
const SOCKET_DOWN_MS = 15_000;

// After a hidden→visible transition we force a resync, then wait this long for
// the sub-acks to land before comparing versions. A version that jumped while
// the tab was "open" but hidden proves we missed live frames.
const RESYNC_SETTLE_MS = 1_500;

// Per-kind cooldown so a flapping pipeline doesn't spam toasts + crash reports.
const WEDGE_COOLDOWN_MS = 60_000;

// Module-level cooldown clock, keyed by wedge kind. Survives component remounts
// so a flapping pipeline that tears the watcher down and back up still throttles.
const lastWedgeAt = new Map<string, number>();

type WedgeKind = "socket-down" | "missed-updates";

function wedge(kind: WedgeKind, detail: string): void {
  const now = Date.now();
  const prev = lastWedgeAt.get(kind);
  if (prev !== undefined && now - prev < WEDGE_COOLDOWN_MS) return;
  lastWedgeAt.set(kind, now);

  ShellCommands.Toast({
    title: "Live updates stalled",
    description: "Reconnecting… refresh if data looks stale",
    variant: "warning",
  });

  // report() never throws (it swallows beacon failures internally), but we still
  // void it to satisfy promise-safety lint. Stable message/label so the crashes
  // plugin dedups every repeat into one growing-count task.
  void report({
    source: "live-state-wedge",
    errorType: "LiveStateWedge",
    message: `live-state wedged: ${kind} — ${detail}`,
    label: "live-state.watchdog",
    url: location.href,
    userAgent: navigator.userAgent,
  });
}

/**
 * No-render Core.Root watchdog that detects a wedged client live-state pipeline
 * and surfaces it loudly (transient toast + deduped crash task). Detection is
 * fully event/transition-driven with single armed timeouts — no polling.
 */
export function WedgeWatchdog() {
  useEffect(() => {
    // --- Signal 1: socket-down wedge ---
    // One armed timeout per url. Armed on reconnecting/closed, cleared on open.
    const downTimers = new Map<string, ReturnType<typeof setTimeout>>();

    const clearDownTimer = (url: string) => {
      const t = downTimers.get(url);
      if (t) {
        clearTimeout(t);
        downTimers.delete(url);
      }
    };

    const unsubWs = subscribeWsStatus(({ url, status }) => {
      if (status === "open") {
        clearDownTimer(url);
      } else if (status === "reconnecting" || status === "closed") {
        if (downTimers.has(url)) return; // already armed for this url
        const timer = setTimeout(() => {
          downTimers.delete(url);
          wedge("socket-down", url);
        }, SOCKET_DOWN_MS);
        downTimers.set(url, timer);
      }
    });

    // --- Signal 2: missed-updates wedge + self-heal ---
    // On hidden→visible, force a resync (also fixes a stale cache — cheap
    // self-heal) and arm a single settle timeout to compare versions.
    let settleTimer: ReturnType<typeof setTimeout> | null = null;

    const onVisibility = () => {
      if (document.visibilityState !== "visible") return;
      const client = getNotificationsClient();
      if (!client) return; // before first render / outside provider
      const before = client.resync();
      if (before.length === 0) return;

      if (settleTimer) clearTimeout(settleTimer);
      settleTimer = setTimeout(() => {
        settleTimer = null;
        const after = getNotificationsClient();
        if (!after) return;
        const snapshot = after.debugSnapshot();

        for (const prev of before) {
          // Match the pre-resync sub by key; if its version climbed past what we
          // last applied, a push arrived only via the forced resync — we missed
          // it live while hidden, which is the exact bug.
          const matches = snapshot.subs.filter((s) => s.key === prev.key);
          for (const s of matches) {
            if (s.version > prev.prevVersion) {
              wedge("missed-updates", `${prev.key} ${prev.prevVersion}->${s.version}`);
              return;
            }
          }
        }
      }, RESYNC_SETTLE_MS);
    };

    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      unsubWs();
      for (const t of downTimers.values()) clearTimeout(t);
      downTimers.clear();
      if (settleTimer) clearTimeout(settleTimer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return null;
}
