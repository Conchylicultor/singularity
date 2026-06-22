import { Client } from "pg";
import { connectionString } from "@plugins/database/plugins/admin/server";
import { Log } from "@plugins/primitives/plugins/log-channels/server";
import { parseLiveStatePayload } from "./parse-payload";
import { getCoveredTables } from "./triggers";
import { routeChange } from "./route-change";

const log = Log.channel("change-feed", { persist: true });

// How often the liveness timer re-checks the socket. This is NOT change-polling
// (changes arrive push-style via NOTIFY); it is a reconnect watchdog that
// re-establishes a socket the `error`/`end` handlers somehow missed (mirrors the
// reconcile timer in git-watcher / file-watcher). The only timer in this plugin.
const LIVENESS_INTERVAL_MS = 30_000;

// Backoff bounds for reconnect after an error/end. Simple capped backoff.
const RECONNECT_MIN_MS = 500;
const RECONNECT_MAX_MS = 10_000;

let client: Client | null = null;
let livenessTimer: ReturnType<typeof setInterval> | null = null;
let started = false;
let connecting = false;
let reconnectDelay = RECONNECT_MIN_MS;

// A single raw pg Client on the DIRECT socket (connectionString() bypasses
// pgbouncer, which breaks LISTEN — the same path graphile-worker uses). Drizzle's
// pgbouncer-fronted pool can't carry a session-bound LISTEN, so this is its own
// dedicated connection.
async function connect(): Promise<void> {
  if (connecting || client) return;
  connecting = true;
  try {
    const c = new Client({ connectionString: connectionString() });

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
      routeChange(change);
    });

    await c.connect();
    await c.query("LISTEN live_state");
    client = c;
    reconnectDelay = RECONNECT_MIN_MS; // reset backoff on success

    // Mark-stale-on-(re)connect: a dropped socket may have missed NOTIFYs while
    // down (or this is the first connect after boot, before which writes were
    // unobserved). Fire a FULL invalidation across every table we installed a
    // trigger on so no resource can be stranded stale. applyDbChange drops any
    // table no resource reads, so sweeping the full table universe is safe and
    // total — it only does work for currently-subscribed, DB-backed resources.
    fullSweep();

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
  for (const table of getCoveredTables()) {
    routeChange({ table, op: "U", ids: null });
  }
}

function scheduleReconnect(): void {
  if (!started) return;
  // Tear down the dead client so the next connect() starts clean.
  const dead = client;
  client = null;
  if (dead) {
    void dead.end().catch((err) => {
      // Already-dead socket; surface rather than swallow.
      log.publish(
        `[change-feed] error ending dead client: ${String(err)}`,
        "stderr",
      );
    });
  }
  const delay = reconnectDelay;
  reconnectDelay = Math.min(reconnectDelay * 2, RECONNECT_MAX_MS);
  setTimeout(() => {
    if (started) void connect();
  }, delay);
}

export function startListener(): void {
  if (started) return;
  started = true;
  void connect();

  // Liveness watchdog: if the socket is gone (handlers missed, or a reconnect
  // attempt is overdue), re-establish it. Push-adjacent, not change-polling.
  livenessTimer = setInterval(() => {
    if (!client && !connecting) void connect();
  }, LIVENESS_INTERVAL_MS);
}

export async function stopListener(): Promise<void> {
  started = false;
  if (livenessTimer) {
    clearInterval(livenessTimer);
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
