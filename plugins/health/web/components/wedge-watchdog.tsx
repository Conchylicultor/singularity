import { useEffect } from "react";
import { subscribeWsStatus } from "@plugins/primitives/plugins/networking/web";
import { getNotificationsClient, liveStateSocketKind } from "@plugins/primitives/plugins/live-state/web";
import { ShellCommands } from "@plugins/shell/web";
import { report } from "@plugins/crashes/web";

// How long a socket may stay non-open before we declare the live-state pipeline
// wedged. A transient reconnect self-heals well within this window via sub-ack;
// only a truly stuck socket survives it.
const SOCKET_DOWN_MS = 15_000;

// Per-kind cooldown so a flapping pipeline doesn't spam toasts + crash reports.
const WEDGE_COOLDOWN_MS = 60_000;

// Module-level cooldown clock, keyed by wedge kind. Survives component remounts
// so a flapping pipeline that tears the watcher down and back up still throttles.
const lastWedgeAt = new Map<string, number>();

type WedgeKind = "socket-down" | "missed-updates";

// Stable per-failure-mode discriminator folded into the crash `errorType`. The
// crash fingerprint is sha256(errorType + stack), and wedges carry no stack — so
// this is what keeps the failure modes from collapsing into one fingerprint and
// one growing-count task. socket-down splits by channel (worktree vs central —
// distinct failure domains, only two values), classified authoritatively by
// live-state rather than sniffed from the url; missed-updates stays kind-only so
// a broad pipeline wedge files ONE task, not one per stuck resource (the key
// stays in the message + count for triage). No volatile data (versions, params)
// enters this, so each mode still dedups into a single task.
function wedge(kind: WedgeKind, discriminator: string, detail: string): void {
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
  // void it to satisfy promise-safety lint. The discriminator gives each failure
  // mode a distinct fingerprint; the stable message/label still dedups repeats of
  // a given mode into one growing-count task.
  void report({
    source: "live-state-wedge",
    errorType: `LiveStateWedge:${discriminator}`,
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
      // The status bus is global across EVERY app socket (logs, terminal,
      // build, …). Only the live-state pipeline sockets count toward a
      // live-state wedge — an unrelated socket's downtime (e.g. a build popover
      // left open while the server restarts) must not file a live-state crash.
      const channelKind = liveStateSocketKind(url);
      if (channelKind === null) return;
      if (status === "open") {
        clearDownTimer(url);
      } else if (status === "reconnecting" || status === "closed") {
        if (downTimers.has(url)) return; // already armed for this url
        const timer = setTimeout(() => {
          downTimers.delete(url);
          wedge("socket-down", `socket-down:${channelKind}`, url);
        }, SOCKET_DOWN_MS);
        downTimers.set(url, timer);
      }
    });

    // --- Signal 2: missed-updates wedge + self-heal ---
    // On hidden→visible, run the client probe (forces a resync — also a cheap
    // stale-cache self-heal — and reports only genuinely-missed subs). The probe
    // self-resolves after its settle window; an in-flight guard ignores rapid
    // re-focus while one is running.
    let probing = false;

    const onVisibility = () => {
      if (document.visibilityState !== "visible" || probing) return;
      const client = getNotificationsClient();
      if (!client) return; // before first render / outside provider
      probing = true;
      void client
        .probeMissedUpdates()
        .then((missed) => {
          if (missed.length === 0) return;
          const m = missed[0]!;
          const more = missed.length > 1 ? ` (+${missed.length - 1} more)` : "";
          wedge("missed-updates", "missed-updates", `${m.key} ${m.prevVersion}->${m.ackVersion}${more}`);
        })
        .finally(() => {
          probing = false;
        });
    };

    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      unsubWs();
      for (const t of downTimers.values()) clearTimeout(t);
      downTimers.clear();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return null;
}
