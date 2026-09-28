/**
 * A reconnect after a subscription gap replays a FRESH value, end to end on a
 * deployed build.
 *
 * The bug (research/2026-09-27-global-live-substrate-gaps.md, gap 1): the
 * live-state server used to answer a reconnecting tab's replay with
 * `up-to-date`/`up-to-date-batch` from memory even when the truth changed
 * while the tab's WebSocket was down and nobody else was subscribed — the
 * per-pk version counter it compared against was never bumped for an
 * untracked tuple, so an echoed version could still match. The fix
 * (`registerSubOnSocket` in resource-runtime/core/runtime.ts) makes every
 * subscription span open with a FRESH version on the global 0→1 transition,
 * so a replay that arrives after the old socket's `close` was processed can
 * never short-circuit — it always takes the full path and gets a real
 * `sub-ack`.
 *
 * Resource under test: the notifications bell's `notifications` collection
 * (`plugins/shell/plugins/notifications`) — a `liveCollection` window
 * (bounded, DB-backed, preloaded at boot), changeable from outside the page
 * with one HTTP call (`POST /api/notifications`), harmless and reversible
 * (the created row is dismissed in a `finally`).
 *
 * Mechanism: `page.routeWebSocket(/\/ws\/notifications/, …)` proxies every
 * connection the page opens to the real server via `ws.connectToServer()`, so
 * the app behaves normally except for the one thing this script controls:
 *
 *   1. drop the socket SERVER-side (`server.close()` on the first
 *      connection) — the backend sees a real close and releases the tab's
 *      subs, ending the tracking span for every tuple it held;
 *   2. HOLD the client's reconnect — the routed-WebSocket handler for the
 *      NEXT connection `await`s a gate before ever calling
 *      `connectToServer()`, so the page's new `WebSocket` stays pending
 *      (Playwright only decides mocked-vs-real once the handler's returned
 *      promise settles — see the "Intercepting" section of
 *      https://playwright.dev/docs/api/class-websocketroute);
 *   3. make the HTTP change while the reconnect is held, wait ~1s, then
 *      release the gate;
 *   4. assert the page shows the change within a few seconds, and record
 *      which frame answered the `notifications` replay — the fixed server
 *      must answer `sub-ack` (fresh data), never `up-to-date-batch`.
 *
 * WRITES: creates one notification via the app's own endpoint and dismisses
 * it in a `finally`, whatever the run's outcome.
 *
 * Usage:
 *   ./singularity run plugins/network/plugins/live/e2e/reconnect-after-gap.ts [--headed]
 */

import {
  boot,
  pathUrl,
  report,
  snap,
  waitFor,
  withBrowser,
} from "@plugins/framework/plugins/tooling/plugins/e2e-harness/e2e";
import type { Page, WebSocketRoute } from "playwright";

const OUT = "/tmp/claude-501/reconnect-after-gap";
const r = report(
  "network/live · a reconnect after a subscription gap replays a fresh value",
);

/** How long the reconnect is held while the HTTP change lands. */
const RECONNECT_HOLD_MS = 1000;
/** How long the DOM may take to reflect the reconnect's replay. */
const SETTLE_TIMEOUT_MS = 10_000;

const NOTIFICATIONS_WS = /\/ws\/notifications(\?|$)/;

const bell = (page: Page) =>
  page.getByRole("button", { name: /^Notifications/ });
const rows = (page: Page) =>
  page.locator('[data-testid="notification-list"] li');

/** One frame that answered a resource's replay on a given connection. */
interface ReplayFrame {
  kind: "sub-ack" | "up-to-date-batch";
  socketIndex: number;
}

await withBrowser(async (h) => {
  const { page, captured } = await h.session();

  const post = async (path: string, data?: unknown) => {
    const res = await page.request.post(pathUrl(path), { data: data ?? {} });
    if (!res.ok()) throw new Error(`POST ${path} — ${res.status()}`);
  };

  // --- take control of /ws/notifications ---------------------------------
  // Every connection is proxied to the real server (default forwarding both
  // ways once `connectToServer()` runs), except: the connection at
  // `holdAtIndex` is held — its handler parks on `holdGate` BEFORE calling
  // `connectToServer()` — and every server→page frame is inspected (then
  // manually forwarded, since registering `onMessage` disables the default
  // relay) to record which frame answered which resource's replay.
  let socketIndex = -1;
  let holdAtIndex: number | null = null;
  let releaseHold!: () => void;
  const holdGate = new Promise<void>((resolve) => {
    releaseHold = resolve;
  });
  const servers: WebSocketRoute[] = [];
  const replaysFor: Record<string, ReplayFrame[]> = {};

  await page.routeWebSocket(NOTIFICATIONS_WS, async (ws) => {
    const idx = ++socketIndex;
    if (idx === holdAtIndex) await holdGate;
    const server = ws.connectToServer();
    servers[idx] = server;
    server.onMessage((message) => {
      const text =
        typeof message === "string" ? message : message.toString("utf8");
      // Every live-state frame is one JSON object.
      const msg = JSON.parse(text) as {
        kind?: string;
        key?: string;
        entries?: Array<{ key?: string }>;
      };
      if (msg.kind === "sub-ack" && msg.key) {
        (replaysFor[msg.key] ??= []).push({
          kind: "sub-ack",
          socketIndex: idx,
        });
      } else if (
        msg.kind === "up-to-date-batch" &&
        Array.isArray(msg.entries)
      ) {
        for (const e of msg.entries) {
          if (!e.key) continue;
          (replaysFor[e.key] ??= []).push({
            kind: "up-to-date-batch",
            socketIndex: idx,
          });
        }
      }
      ws.send(message);
    });
  });

  const stamp = Date.now();
  const id = `e2e-reconnect-gap-${stamp}`;
  const title = `e2e reconnect-after-gap ${stamp}`;
  let created = false;

  try {
    await boot(page, pathUrl("/"), { settleMs: 1500 });

    await bell(page).click();
    await page
      .locator('[data-testid="notification-list"]')
      .waitFor({ timeout: SETTLE_TIMEOUT_MS });
    await snap(page, OUT, "1-before");

    // The initial popover paint can come straight from the boot-snapshot
    // cache, so the live socket may not have connected yet even once the
    // list is visible — poll for it rather than asserting immediately.
    const opened = await waitFor(
      () => Promise.resolve(socketIndex),
      (v) => v >= 0,
      { timeoutMs: SETTLE_TIMEOUT_MS, intervalMs: 100 },
    );
    r.ok(
      "the app opened its /ws/notifications connection",
      opened.ok,
      `socketIndex=${opened.value}`,
    );

    // Arm the hold for the RECONNECT (the next connection, index 1), then
    // drop the CURRENT connection's server side: the backend sees a real
    // close and releases this tab's subs — every tuple it held (including
    // `notifications`) ends its tracking span right here.
    holdAtIndex = socketIndex + 1;
    const dropped = socketIndex;
    r.note(`dropping connection ${dropped} server-side`);
    await servers[dropped]!.close();

    // Confirm the reconnect attempt has actually begun and is now held
    // (its handler incremented `socketIndex` synchronously before parking on
    // `holdGate`) before making the change — so the change is guaranteed
    // to land entirely inside the gap.
    const held = await waitFor(
      () => Promise.resolve(socketIndex),
      (v) => v === holdAtIndex,
      { timeoutMs: SETTLE_TIMEOUT_MS, intervalMs: 100 },
    );
    r.ok(
      "the client's reconnect attempt is held before connecting to the server",
      held.ok,
      `socketIndex=${held.value}`,
    );

    // The HTTP change, made entirely inside the gap: nobody is subscribed to
    // `notifications` right now (the socket that held it is closed, and the
    // reconnect is parked), so this is exactly the "changed while untracked"
    // case the fix targets.
    await post("/api/notifications", {
      id,
      type: "e2e-reconnect-gap",
      title,
      description: "seeded by reconnect-after-gap.ts",
      variant: "info",
    });
    created = true;
    r.note(`created notification ${id} while the reconnect was held`);

    await page.waitForTimeout(RECONNECT_HOLD_MS);

    r.note(`releasing connection ${holdAtIndex}`);
    releaseHold();

    // The page shows the change within a few seconds — poll (read, then
    // re-read to a deadline), never a fixed sleep.
    const settled = await waitFor(
      () => rows(page).filter({ hasText: title }).count(),
      (n) => n > 0,
      { timeoutMs: SETTLE_TIMEOUT_MS },
    );
    r.ok(
      `the new notification appears after the reconnect (${settled.waitedMs}ms, ${settled.attempts} attempt(s))`,
      settled.ok,
      `rows matching title = ${settled.value}`,
    );
    await snap(page, OUT, "2-after");

    // Which frame answered the `notifications` replay on the reconnect?
    const onReconnect = (replaysFor["notifications"] ?? []).filter(
      (f) => f.socketIndex === holdAtIndex,
    );
    r.note(
      `notifications replay frame(s) on connection ${holdAtIndex}: ${JSON.stringify(onReconnect)}`,
    );
    r.ok(
      "the `notifications` resource replayed on the reconnect",
      onReconnect.length > 0,
    );
    r.eq(
      "…and it was answered with a `sub-ack` (fresh data), never `up-to-date-batch` — the reconnect fix",
      onReconnect.map((f) => f.kind),
      onReconnect.length > 0 ? ["sub-ack"] : [],
    );
  } finally {
    if (created) {
      const res = await page.request.post(
        pathUrl(`/api/notifications/${id}/dismiss`),
        { data: {} },
      );
      r.ok(`cleanup dismissed ${id}`, res.ok(), `HTTP ${res.status()}`);
    }
  }

  r.ok(
    "no uncaught page errors",
    captured.pageErrors.length === 0,
    captured.pageErrors.join(" | "),
  );
});

await r.finish();
