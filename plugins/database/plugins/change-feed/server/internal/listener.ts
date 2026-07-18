import { Client } from "pg";
import { runTracked } from "@plugins/infra/plugins/runtime-profiler/core";
import { connectionString } from "@plugins/database/plugins/admin/server";
import { parseLiveStatePayload, type DbChange } from "./parse-payload";
import { getCoveredTables } from "./triggers";
import { routeChange } from "./route-change";
import { changeFeedLog as log } from "./log-sink";

// How often the liveness timer re-checks the socket. This is NOT change-polling
// (changes arrive push-style via NOTIFY); it is a reconnect watchdog that
// re-establishes a socket the `error`/`end` handlers somehow missed (mirrors the
// reconcile timer in git-watcher / file-watcher). The only timer in this plugin.
const LIVENESS_INTERVAL_MS = 30_000;

// Backoff bounds for reconnect after an error/end. Simple capped backoff.
const RECONNECT_MIN_MS = 500;
const RECONNECT_MAX_MS = 10_000;

export interface ChangeFeedListenerOptions {
  connectionString: () => string;
  route: (change: DbChange) => void;
  coveredTables: () => readonly string[];
  livenessIntervalMs?: number;
  reconnectMinMs?: number;
  reconnectMaxMs?: number;
  setTimeoutFn?: typeof setTimeout;
  setIntervalFn?: typeof setInterval;
  clearIntervalFn?: typeof clearInterval;
}

// Build an isolated change-feed listener. ALL mutable state is per-instance
// closure state, so two listeners (e.g. production + a test) never share a
// socket, backoff counter, or firstConnect flag. The real deps
// (connectionString / routeChange / getCoveredTables / the global timers) are
// injected so tests can point a listener at a throwaway DB with a recording
// route spy and deterministic timers.
export function createChangeFeedListener(opts: ChangeFeedListenerOptions): {
  start(): void;
  stop(): Promise<void>;
} {
  const livenessIntervalMs = opts.livenessIntervalMs ?? LIVENESS_INTERVAL_MS;
  const reconnectMinMs = opts.reconnectMinMs ?? RECONNECT_MIN_MS;
  const reconnectMaxMs = opts.reconnectMaxMs ?? RECONNECT_MAX_MS;
  const setTimeoutFn = opts.setTimeoutFn ?? globalThis.setTimeout;
  const setIntervalFn = opts.setIntervalFn ?? globalThis.setInterval;
  const clearIntervalFn = opts.clearIntervalFn ?? globalThis.clearInterval;

  let client: Client | null = null;
  let livenessTimer: ReturnType<typeof setInterval> | null = null;
  let started = false;
  let connecting = false;
  let firstConnect = true;
  let reconnectDelay = reconnectMinMs;

  // A single raw pg Client on the DIRECT socket (connectionString() bypasses
  // pgbouncer, which breaks LISTEN — the same path graphile-worker uses). Drizzle's
  // pgbouncer-fronted pool can't carry a session-bound LISTEN, so this is its own
  // dedicated connection.
  async function connect(): Promise<void> {
    if (connecting || client) return;
    connecting = true;
    try {
      const c = new Client({ connectionString: opts.connectionString() });

      // The two failure paths: a connection-level `error` (socket dropped, PG
      // restarted) and a clean `end`. Both schedule a reconnect. The handlers are
      // attached before connect() so a failure during connect is also caught.
      c.on("error", (err) => {
        log.publish(
          `[change-feed] LISTEN client error: ${String(err)}`,
          "stderr",
        );
        scheduleReconnect();
      });
      c.on("end", () => {
        if (started) scheduleReconnect();
      });

      c.on("notification", (n) => {
        if (!n.payload) return;
        const change = parseLiveStatePayload(n.payload);
        if (!change) {
          // Defensive skip — a malformed payload must never crash the listener.
          log.publish(
            `[change-feed] skipping unparseable payload: ${n.payload}`,
            "stderr",
          );
          return;
        }
        opts.route(change);
      });

      await c.connect();
      await c.query("LISTEN live_state");
      client = c;
      reconnectDelay = reconnectMinMs; // reset backoff on success

      // Mark-stale-on-RECONNECT only — never on the first (boot) connect.
      //
      // At cold boot the authoritative driver is the bounded catch-up in
      // live-state-snapshot (snapshot floor + changelog replay): because LISTEN is
      // already established here before catch-up runs, replay is precise and
      // gap-free, and it recomputes ONLY the resources whose tables actually
      // changed during downtime. An unconditional fullSweep at boot would instead
      // re-run + re-persist every boot-critical loader, defeating that precision.
      // So skip the sweep on the first successful connect.
      //
      // On a genuine RECONNECT (mid-session socket drop), a dropped socket may have
      // missed NOTIFYs while down, so fullSweep stays as defense-in-depth: it fires
      // a FULL invalidation across every triggered table. applyDbChange drops any
      // table no resource reads, so the sweep only does work for currently-
      // subscribed, DB-backed resources.
      //
      // See research/2026-06-23-global-live-state-persisted-read-set-no-boot-recompute.md.
      if (firstConnect) {
        firstConnect = false; // flips only AFTER a successful first connect
      } else {
        fullSweep();
      }

      log.publish("[change-feed] LISTEN live_state established");
    } catch (err) {
      log.publish(
        `[change-feed] connect failed: ${String(err)}`,
        "stderr",
      );
      scheduleReconnect();
    } finally {
      connecting = false;
    }
  }

  function fullSweep(): void {
    for (const table of opts.coveredTables()) {
      opts.route({ table, op: "U", ids: null });
    }
  }

  function scheduleReconnect(): void {
    if (!started) return;
    // Tear down the dead client so the next connect() starts clean.
    const dead = client;
    client = null;
    if (dead) {
      // eslint-disable-next-line detached-work-safety/no-untracked-detached-work -- trivial fire-and-forget close of an already-dead socket
      void dead.end().catch((err) => {
        // Already-dead socket; surface rather than swallow.
        log.publish(
          `[change-feed] error ending dead client: ${String(err)}`,
          "stderr",
        );
      });
    }
    const delay = reconnectDelay;
    reconnectDelay = Math.min(reconnectDelay * 2, reconnectMaxMs);
    setTimeoutFn(() => {
      if (started) void runTracked("change-feed:reconnect", () => connect());
    }, delay);
  }

  function start(): void {
    if (started) return;
    started = true;
    void runTracked("change-feed:connect", () => connect());

    // Liveness watchdog: if the socket is gone (handlers missed, or a reconnect
    // attempt is overdue), re-establish it. Push-adjacent, not change-polling.
    livenessTimer = setIntervalFn(() => {
      if (!client && !connecting) {
        void runTracked("change-feed:reconnect", () => connect());
      }
    }, livenessIntervalMs);
  }

  async function stop(): Promise<void> {
    started = false;
    if (livenessTimer) {
      clearIntervalFn(livenessTimer);
      livenessTimer = null;
    }
    const c = client;
    client = null;
    if (c) {
      try {
        await c.end();
      } catch (err) {
        log.publish(
          `[change-feed] error closing LISTEN client: ${String(err)}`,
          "stderr",
        );
      }
    }
  }

  return { start, stop };
}

// Production singleton: the real backend wires one listener to the real deps and
// re-presents it as the existing startListener / stopListener exports that
// change-feed's own server/index.ts calls (onReady / onShutdown). These are NOT
// in the plugin's public barrel, so the factory refactor is fully contained.
const defaultListener = createChangeFeedListener({
  connectionString,
  route: routeChange,
  coveredTables: getCoveredTables,
});

export function startListener(): void {
  defaultListener.start();
}

export async function stopListener(): Promise<void> {
  await defaultListener.stop();
}
