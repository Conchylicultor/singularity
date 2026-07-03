/**
 * NotificationsClient reconnect + resync hazard tests. The REAL client runs on a
 * `createTransportHub()`; the socket is dropped (`serverClose`), reconnected
 * through the SharedWebSocket backoff, and the client's `replaySubs` +
 * `probeMissedUpdates` recovery paths are exercised end-to-end. Only the three
 * OS globals are faked.
 *
 * Pins, cross-referencing the v3 mental-model doc §9 and
 * `research/2026-07-03-global-live-state-client-transport-harness.md`:
 *   - H1: frames lost during the reopen gap (a push to a closed socket is
 *     silently dropped) are recovered by the reconnect resubscribe converging to
 *     server truth;
 *   - H1b: `replaySubs` staggers — 6 resends in batch 0, the rest at +150ms;
 *   - H2: a server restart resets the version counters, and post-restart sub-acks
 *     at a LOWER version apply because each sub is reset to the -1 baseline AT ITS
 *     SEND TIME — with the pin that a not-yet-resent stagger-batch sub keeps its
 *     live baseline (a stale frame for it is still version-dropped);
 *   - H7: a lost intermediate level-state frame still converges on the next full
 *     frame, and `probeMissedUpdates` surfaces a silently-missed gap end-to-end.
 *
 * Conventions: `clientLog` mocked to a no-op; fake timers per test; Math.random
 * pinned to 0.5 so the reconnect backoff delay is exactly the base (500ms); every
 * client `destroy()`-ed in afterEach (module-level buses shared across the file).
 */

import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("@plugins/primitives/plugins/log-channels/web", () => ({ clientLog: () => {} }));

import { QueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { createTransportHub, type FakeWebSocket } from "@plugins/primitives/plugins/networking/web";
import { NotificationsClient } from "../notifications-client";

const pushSchema = z.object({ status: z.string() });

const flush = async (): Promise<void> => {
  await vi.advanceTimersByTimeAsync(0);
};

describe("NotificationsClient — reconnect + resync", () => {
  const clients: NotificationsClient[] = [];

  async function setup(): Promise<{
    hub: ReturnType<typeof createTransportHub>;
    qc: QueryClient;
    client: NotificationsClient;
    socket: FakeWebSocket;
  }> {
    const hub = createTransportHub();
    const qc = new QueryClient();
    const tab = hub.tab();
    const client = new NotificationsClient(qc, { makeSocket: hub.makeSocket(tab) });
    clients.push(client);
    await flush(); // elected → worktree socket created (connecting)
    const socket = hub.server.all()[0]!;
    socket.open(); // leader socket open
    return { hub, qc, client, socket };
  }

  // The single connecting socket the SharedWebSocket just created for reconnect.
  const nextSocket = (hub: ReturnType<typeof createTransportHub>): FakeWebSocket =>
    hub.server.all().find((s) => s.readyState === 0)!;
  const subFrames = (socket: FakeWebSocket, key?: string): Record<string, unknown>[] =>
    socket.sentJson().filter((m) => m.op === "sub" && (key === undefined || m.key === key));

  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0.5); // backoff delay = base·(0.5+0.5) = base
  });

  afterEach(() => {
    for (const c of clients.splice(0)) c.destroy();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  test("H1: frames lost during the reopen gap are recovered by the resubscribe convergence", async () => {
    const { client, hub, socket, qc } = await setup();
    client.observe("k", {}, undefined, pushSchema);
    socket.serverSend({ kind: "sub-ack", key: "k", params: {}, value: { status: "v1" }, version: 1 });
    expect(qc.getQueryData(["k"])).toEqual({ status: "v1" });

    // Socket drops; a v2 frame lands on the now-closed socket and is silently lost
    // (serverSend is guarded on OPEN — the exact reopen gap).
    socket.serverClose();
    socket.serverSend({ kind: "update", key: "k", params: {}, value: { status: "v2-lost" }, version: 2 });
    expect(qc.getQueryData(["k"])).toEqual({ status: "v1" }); // never delivered

    // Backoff reconnect (exactly 500ms), then a fresh socket + staggered replay.
    await vi.advanceTimersByTimeAsync(500);
    const socket2 = nextSocket(hub);
    socket2.open();
    await vi.advanceTimersByTimeAsync(0); // stagger batch 0 → resub
    expect(subFrames(socket2, "k")).toHaveLength(1); // exactly one resub per active sub

    // The resync sub-ack at v3 converges the cache to server truth.
    socket2.serverSend({ kind: "sub-ack", key: "k", params: {}, value: { status: "v3" }, version: 3 });
    expect(qc.getQueryData(["k"])).toEqual({ status: "v3" });
  });

  test("H1b: replaySubs staggers resends — 6 in batch 0, the remaining 2 at +150ms", async () => {
    const { client, hub, socket } = await setup();
    const keys = Array.from({ length: 8 }, (_, i) => `k${i}`);
    for (const k of keys) client.observe(k, {}, undefined, pushSchema);
    expect(subFrames(socket)).toHaveLength(8);

    // Drop → reconnect → fresh socket whose open triggers the staggered replay.
    socket.serverClose();
    await vi.advanceTimersByTimeAsync(500);
    const socket2 = nextSocket(hub);
    socket2.open();

    // Batch 0 (setTimeout(…, 0)) fires the first BASE_BATCH_SIZE=6 resends.
    await vi.advanceTimersByTimeAsync(0);
    expect(subFrames(socket2)).toHaveLength(6);

    // Batch 1 (BATCH_DELAY_MS=150 later) fires the remaining 2.
    await vi.advanceTimersByTimeAsync(150);
    expect(subFrames(socket2)).toHaveLength(8);
  });

  test("H2: a server restart resets version counters — subs converge, and a not-yet-resent sub keeps its live baseline", async () => {
    const { client, hub, socket, qc } = await setup();
    const keys = Array.from({ length: 7 }, (_, i) => `k${i}`); // k0..k5 batch 0, k6 batch 1
    for (const k of keys) client.observe(k, {}, undefined, pushSchema);
    for (const k of keys) {
      socket.serverSend({ kind: "sub-ack", key: k, params: {}, value: { status: `${k}-old` }, version: 5 });
    }
    expect(qc.getQueryData(["k0"])).toEqual({ status: "k0-old" });
    expect(qc.getQueryData(["k6"])).toEqual({ status: "k6-old" });

    // Backend restart drops the socket; reconnect + open triggers the replay.
    hub.server.restart();
    await vi.advanceTimersByTimeAsync(500);
    const socket2 = nextSocket(hub);
    socket2.open();

    // Batch 0 (k0..k5) resent at t≈0; each reset to the -1 baseline at its send
    // time, so a post-restart sub-ack at the LOWER version 1 still applies.
    await vi.advanceTimersByTimeAsync(0);
    socket2.serverSend({ kind: "sub-ack", key: "k0", params: {}, value: { status: "k0-new" }, version: 1 });
    expect(qc.getQueryData(["k0"])).toEqual({ status: "k0-new" });

    // The pin: k6 is in batch 1 (not yet resent), so its baseline is still the
    // live v5 — a stale v4 frame for it is version-dropped, NOT applied against a
    // prematurely-reset -1.
    socket2.serverSend({ kind: "update", key: "k6", params: {}, value: { status: "k6-stale" }, version: 4 });
    expect(qc.getQueryData(["k6"])).toEqual({ status: "k6-old" }); // dropped against the live baseline

    // Batch 1 fires (+150) → k6 reset + resent; its post-restart sub-ack converges.
    await vi.advanceTimersByTimeAsync(150);
    socket2.serverSend({ kind: "sub-ack", key: "k6", params: {}, value: { status: "k6-new" }, version: 1 });
    expect(qc.getQueryData(["k6"])).toEqual({ status: "k6-new" });
  });

  test("H7: a lost intermediate level-state frame still converges on the next full frame", async () => {
    const { client, socket, qc } = await setup();
    client.observe("k", {}, undefined, pushSchema);
    socket.serverSend({ kind: "sub-ack", key: "k", params: {}, value: { status: "working" }, version: 1 });
    expect(qc.getQueryData(["k"])).toEqual({ status: "working" });

    // The v2 frame never arrives (lost). Level state carries full truth, so the
    // next full frame at v3 converges — no replay of the missing intermediate.
    socket.serverSend({ kind: "update", key: "k", params: {}, value: { status: "gone" }, version: 3 });
    expect(qc.getQueryData(["k"])).toEqual({ status: "gone" });
  });

  test("H7: probeMissedUpdates surfaces a silently-missed gap end-to-end", async () => {
    const { client, socket, qc } = await setup();
    client.observe("k", {}, undefined, pushSchema);
    socket.serverSend({ kind: "sub-ack", key: "k", params: {}, value: { status: "v1" }, version: 1 });
    socket.serverSend({ kind: "update", key: "k", params: {}, value: { status: "v3" }, version: 3 });
    expect(qc.getQueryData(["k"])).toEqual({ status: "v3" });

    // Start the probe: it forces a NON-staggered resync synchronously (the resub
    // is on the wire before the returned promise even settles), then awaits a
    // fixed settle window for the sub-acks.
    const probe = client.probeMissedUpdates(200);
    expect(subFrames(socket, "k")).toHaveLength(2); // initial observe + forced resync

    // The resync sub-ack reveals a higher server version — the missed frames —
    // landing BEFORE the settle window elapses.
    socket.serverSend({ kind: "sub-ack", key: "k", params: {}, value: { status: "v9" }, version: 9 });
    expect(qc.getQueryData(["k"])).toEqual({ status: "v9" }); // cache converged

    await vi.advanceTimersByTimeAsync(200); // settle elapses
    const missed = await probe;
    expect(missed).toHaveLength(1);
    expect(missed[0]).toMatchObject({ key: "k", prevVersion: 3, ackVersion: 9 });
  });
});
