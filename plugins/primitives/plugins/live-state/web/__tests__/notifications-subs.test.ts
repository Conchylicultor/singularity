/**
 * NotificationsClient subscription-lifecycle + frame-gate hazard tests. The REAL
 * client runs on a `createTransportHub()` (fake server + BroadcastChannel bus +
 * lock manager) wired through the `makeSocket` hook, so the version guard, keyed-
 * delta merge, keep-alive teardown timers, and etag recovery are all exercised
 * for real; only the three OS globals are faked.
 *
 * Pins, cross-referencing the v3 mental-model doc §9 and
 * `research/2026-07-03-global-live-state-client-transport-harness.md`:
 *   - H4: observe/unobserve churn inside the keep-alive window collapses to a
 *     single sub, and yields exactly one unsub once the window elapses;
 *   - H4b: the deferred-teardown timer fires only after the FULL window;
 *   - the no-sub gate: a broadcast frame for a never-observed key is dropped
 *     (no throw, no cache write) — the all-tabs fan-out safety;
 *   - delta-no-base → forced resub (etag cleared, cache untouched), and the
 *     BUG-A fix: the recovery resub carries NO version echo and its sub-ack
 *     APPLIES even at the version the broken delta already advanced us to
 *     (baselines reset in forceFullResub — without it the `<=` guard dropped
 *     the recovery ack and the cache never healed);
 *   - delta-drift → same forced-resub + recovery-applies contract;
 *   - the WS version guard (`<=` drop, `>` apply);
 *   - every sub/unsub frame carries this tab's id, and `pagehide` emits a
 *     best-effort `unsub-tab` per channel (the per-tab server bookkeeping).
 *
 * Conventions: `clientLog` is mocked to a no-op (otherwise `trace()` schedules
 * real fetch flushes and registers a permanent bus listener at module eval);
 * fake timers per test; advance only via the async variants; every constructed
 * client is `destroy()`-ed in afterEach (the module-level ws-status / net-diag
 * buses are shared across the file and cleaned only by proper teardown).
 */

import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("@plugins/primitives/plugins/log-channels/web", () => ({ clientLog: () => {} }));

import { QueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { createTransportHub, type FakeWebSocket } from "@plugins/primitives/plugins/networking/web";
import { NotificationsClient } from "../notifications-client";
import { getResourceWatermark } from "../watermark-registry";
import { hasResourceTxAck } from "../tx-ack-registry";

// SUB_KEEPALIVE_MS is not exported; keep the literal in sync with
// notifications-client.ts (the deferred-teardown gc window).
const SUB_KEEPALIVE_MS = 30_000;

const pushSchema = z.object({ status: z.string() });
const keyedSchema = z.array(z.object({ id: z.string(), n: z.number().optional() }));
const keyOf = (row: unknown): string => (row as { id: string }).id;

const flush = async (): Promise<void> => {
  await vi.advanceTimersByTimeAsync(0);
};

describe("NotificationsClient — subs lifecycle + frame gates", () => {
  const clients: NotificationsClient[] = [];

  // A fresh client whose worktree socket is elected + opened (no subs yet).
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
    await flush(); // elected → startLeading → worktree socket created (connecting)
    const socket = hub.server.all()[0]!;
    socket.open(); // leader socket open → replaySubs (no subs yet)
    return { hub, qc, client, socket };
  }

  const subFrames = (socket: FakeWebSocket, key?: string): Record<string, unknown>[] =>
    socket.sentJson().filter((m) => m.op === "sub" && (key === undefined || m.key === key));
  const unsubFrames = (socket: FakeWebSocket): Record<string, unknown>[] =>
    socket.sentJson().filter((m) => m.op === "unsub");

  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0.5);
  });

  afterEach(() => {
    for (const c of clients.splice(0)) c.destroy();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  test("H4: observe/unobserve ×10 collapses to exactly one sub; one unsub after the keep-alive window", async () => {
    const { client, socket } = await setup();
    for (let i = 0; i < 10; i++) {
      client.observe("k", {}, undefined, pushSchema);
      client.unobserve("k", {});
    }
    // Only the first observe (refcount 0→1) hit the wire; every later observe
    // resurrected the refcount-0 sub inside its keep-alive window with zero WS
    // traffic, and the intervening unobserves only re-armed the teardown timer.
    expect(subFrames(socket)).toHaveLength(1);
    expect(unsubFrames(socket)).toHaveLength(0); // parked teardown, not yet fired

    await vi.advanceTimersByTimeAsync(SUB_KEEPALIVE_MS + 1);
    expect(unsubFrames(socket)).toHaveLength(1); // the one-shot teardown fired
    expect(client.debugSnapshot().subs).toHaveLength(0);
  });

  test("H4b: the keep-alive teardown fires only after the FULL window", async () => {
    const { client, socket } = await setup();
    client.observe("k", {}, undefined, pushSchema);
    client.unobserve("k", {});

    // One tick short of the window: no unsub, sub still present.
    await vi.advanceTimersByTimeAsync(SUB_KEEPALIVE_MS - 1);
    expect(unsubFrames(socket)).toHaveLength(0);
    expect(client.debugSnapshot().subs).toHaveLength(1);

    // Crossing the window fires the teardown and deletes the sub.
    await vi.advanceTimersByTimeAsync(2);
    expect(unsubFrames(socket)).toHaveLength(1);
    expect(client.debugSnapshot().subs).toHaveLength(0);
  });

  test("no-sub gate: a frame for a never-observed key is dropped (no throw, no cache write)", async () => {
    const { client, socket, qc } = await setup();
    // The shared socket broadcasts every server frame to every tab; a tab that
    // never observed the key must silently drop it (no schema is registered, so
    // an ungated apply would throw).
    socket.serverSend({ kind: "update", key: "ghost", params: {}, value: { status: "x" }, version: 1 });
    expect(qc.getQueryData(["ghost"])).toBeUndefined();
    expect(client.debugSnapshot().subs).toHaveLength(0);
  });

  test("delta-no-base → forced resub: cache untouched, etag cleared, a version-less full sub sent, recovery ack at the SAME version applies (BUG A)", async () => {
    const { client, socket, qc } = await setup();
    client.observe("rk", {}, undefined, keyedSchema, keyOf);
    // Stamp an etag on the sub with NO cached base (a sub whose value never
    // landed) so the recovery-clears-etag behavior is observable.
    client.noteHttpEtag("rk", {}, undefined, "etag-1");
    expect(client.etagFor("rk", {})).toBe("etag-1");
    const before = subFrames(socket, "rk").length;

    socket.serverSend({
      kind: "delta",
      key: "rk",
      params: {},
      upserts: [["a", { id: "a", n: 1 }]],
      deletes: [],
      order: ["a"],
      version: 1,
    });

    expect(qc.getQueryData(["rk"])).toBeUndefined(); // never applied onto a missing base
    expect(client.etagFor("rk", {})).toBeUndefined(); // stale etag cleared
    const after = subFrames(socket, "rk");
    expect(after).toHaveLength(before + 1); // forced full resub
    expect(after.at(-1)!.etag).toBeUndefined(); // the resub carries no stale etag
    expect(after.at(-1)!.version).toBeUndefined(); // and NO version echo (BUG A)

    // BUG A's fix: the broken delta already advanced the sub's version to 1, so
    // pre-fix the recovery sub-ack at that SAME version was `<=`-dropped and the
    // cache never healed. forceFullResub reset the baseline — it applies now.
    socket.serverSend({ kind: "sub-ack", key: "rk", params: {}, value: [{ id: "a", n: 1 }], version: 1 });
    expect(qc.getQueryData(["rk"])).toEqual([{ id: "a", n: 1 }]); // healed
  });

  test("delta-drift → forced resub: an order id resolvable from neither upserts nor base ⇒ cache unchanged, etag cleared, resub, recovery applies (BUG A)", async () => {
    const { client, socket, qc } = await setup();
    client.observe("rk", {}, undefined, keyedSchema, keyOf);
    // Seed a base + etag via a full sub-ack.
    socket.serverSend({
      kind: "sub-ack",
      key: "rk",
      params: {},
      value: [{ id: "a", n: 1 }],
      version: 1,
      etag: "etag-a",
    });
    expect(qc.getQueryData(["rk"])).toEqual([{ id: "a", n: 1 }]);
    expect(client.etagFor("rk", {})).toBe("etag-a");
    const before = subFrames(socket, "rk").length;

    // order names "c" — in neither the upserts nor the cached base → drift.
    socket.serverSend({
      kind: "delta",
      key: "rk",
      params: {},
      upserts: [["b", { id: "b", n: 2 }]],
      deletes: [],
      order: ["a", "b", "c"],
      version: 2,
    });

    expect(qc.getQueryData(["rk"])).toEqual([{ id: "a", n: 1 }]); // untouched, no holes punched
    expect(client.etagFor("rk", {})).toBeUndefined(); // cleared → recovery reloads a full base
    const after = subFrames(socket, "rk");
    expect(after).toHaveLength(before + 1); // forced resub
    expect(after.at(-1)!.version).toBeUndefined(); // recovery never echoes state (BUG A)

    // The drift delta advanced the sub's version to 2 before drift was detected;
    // the recovery sub-ack at that SAME version must APPLY (baseline was reset).
    socket.serverSend({
      kind: "sub-ack",
      key: "rk",
      params: {},
      value: [{ id: "a", n: 1 }, { id: "b", n: 2 }, { id: "c", n: 3 }],
      version: 2,
    });
    expect(qc.getQueryData(["rk"])).toEqual([
      { id: "a", n: 1 },
      { id: "b", n: 2 },
      { id: "c", n: 3 },
    ]); // healed to server truth
  });

  test("every sub/unsub frame carries this tab's id; pagehide emits unsub-tab per channel", async () => {
    const hub = createTransportHub();
    const qc = new QueryClient();
    const tab = hub.tab();
    const client = new NotificationsClient(qc, { makeSocket: hub.makeSocket(tab), tabId: "tab-X" });
    clients.push(client);
    await flush();
    const socket = hub.server.all()[0]!;
    socket.open();

    client.observe("k", {}, undefined, pushSchema);
    expect(subFrames(socket, "k")[0]!.tabId).toBe("tab-X");

    // The keep-alive teardown unsub is tagged too.
    client.unobserve("k", {});
    await vi.advanceTimersByTimeAsync(SUB_KEEPALIVE_MS + 1);
    expect(unsubFrames(socket)[0]!.tabId).toBe("tab-X");

    // pagehide → best-effort unsub-tab on every open channel.
    window.dispatchEvent(new Event("pagehide"));
    const departures = socket.sentJson().filter((m) => m.op === "unsub-tab");
    expect(departures).toHaveLength(1); // one open (worktree) channel
    expect(departures[0]!.tabId).toBe("tab-X");
  });

  test("version guard: a frame with version ≤ the applied version is dropped; a strictly-greater one applies", async () => {
    const { client, socket, qc } = await setup();
    client.observe("k", {}, undefined, pushSchema);
    socket.serverSend({ kind: "sub-ack", key: "k", params: {}, value: { status: "working" }, version: 5 });
    expect(qc.getQueryData(["k"])).toEqual({ status: "working" });

    // Equal version → dropped (the `<=` guard).
    socket.serverSend({ kind: "update", key: "k", params: {}, value: { status: "stale-equal" }, version: 5 });
    expect(qc.getQueryData(["k"])).toEqual({ status: "working" });

    // Lower version → dropped.
    socket.serverSend({ kind: "update", key: "k", params: {}, value: { status: "stale-lower" }, version: 4 });
    expect(qc.getQueryData(["k"])).toEqual({ status: "working" });

    // Strictly greater → applied.
    socket.serverSend({ kind: "update", key: "k", params: {}, value: { status: "fresh" }, version: 6 });
    expect(qc.getQueryData(["k"])).toEqual({ status: "fresh" });
  });

  // sub-error handling (Fix D): a sub-error names the (key, params) it failed
  // for, so the client drives the HTTP-fallback refetch via invalidateQueries —
  // its outcome sets q.error / heals — instead of absorbing the frame and
  // wedging the resource pending forever. Gated on a live local sub, like every
  // other broadcast frame.
  test("sub-error with params for a held sub → invalidateQueries for exactly that query key", async () => {
    const { client, socket, qc } = await setup();
    const invalidate = vi.spyOn(qc, "invalidateQueries");
    client.observe("k", { id: "c1" }, undefined, pushSchema);

    socket.serverSend({ kind: "sub-error", key: "k", params: { id: "c1" }, reason: "loader-failed" });
    expect(invalidate).toHaveBeenCalledTimes(1);
    expect(invalidate.mock.calls[0]![0]).toEqual({ queryKey: ["k", { id: "c1" }] });
  });

  test("sub-error for a non-held key → dropped, no invalidate (broadcast-gate pin)", async () => {
    const { socket, qc } = await setup();
    const invalidate = vi.spyOn(qc, "invalidateQueries");
    // The shared socket broadcasts every frame to every tab; a tab that never
    // observed the key must not act on its sub-error.
    socket.serverSend({ kind: "sub-error", key: "ghost", params: {}, reason: "unknown-key" });
    expect(invalidate).not.toHaveBeenCalled();
  });

  test("legacy params-less sub-error frame → dropped safely (no throw, no invalidate)", async () => {
    const { client, socket, qc } = await setup();
    const invalidate = vi.spyOn(qc, "invalidateQueries");
    client.observe("k", { id: "c1" }, undefined, pushSchema);
    // A pre-upgrade server omits `params`; the client computes paramsKey({}) which
    // cannot match the non-empty-params sub → safe drop, never a throw.
    expect(() =>
      socket.serverSend({ kind: "sub-error", key: "k", reason: "legacy" } as unknown as Record<string, unknown>),
    ).not.toThrow();
    expect(invalidate).not.toHaveBeenCalled();
  });

  // Commit-watermark adoption (Rule B′ client half). The registry is
  // MODULE-LEVEL (shared across tests in this process — that is the point: the
  // optimistic hook reads it without a NotificationsProvider), so each test
  // below uses its own resource key.
  describe("watermark registry adoption", () => {
    test("watermark-carrying frames populate the registry before the cache write; adoption is monotonic (BigInt, not string order)", async () => {
      const { socket, qc, client } = await setup();
      client.observe("wm-a", {}, undefined, pushSchema);

      // sub-ack carries the floor.
      socket.serverSend({ kind: "sub-ack", key: "wm-a", params: {}, value: { status: "s0" }, version: 1, watermark: "100" });
      expect(qc.getQueryData(["wm-a"])).toEqual({ status: "s0" });
      expect(getResourceWatermark("wm-a", {})).toBe("100");

      // A newer-version frame carrying an OLDER watermark (a joiner-adopted
      // flight) applies its value but never regresses the floor.
      socket.serverSend({ kind: "update", key: "wm-a", params: {}, value: { status: "s1" }, version: 2, watermark: "99" });
      expect(qc.getQueryData(["wm-a"])).toEqual({ status: "s1" });
      expect(getResourceWatermark("wm-a", {})).toBe("100");

      // Numeric (BigInt) adoption: "1000" > "999" even though "1000" < "999"
      // as strings.
      socket.serverSend({ kind: "update", key: "wm-a", params: {}, value: { status: "s2" }, version: 3, watermark: "999" });
      socket.serverSend({ kind: "update", key: "wm-a", params: {}, value: { status: "s3" }, version: 4, watermark: "1000" });
      expect(getResourceWatermark("wm-a", {})).toBe("1000");
    });

    test("a watermark-less scoped delta applies but leaves the stored floor untouched; a FULL delta's watermark adopts", async () => {
      const { socket, qc, client } = await setup();
      client.observe("wm-k", {}, undefined, keyedSchema, keyOf);
      socket.serverSend({ kind: "sub-ack", key: "wm-k", params: {}, value: [{ id: "a", n: 1 }], version: 1, watermark: "200" });
      expect(getResourceWatermark("wm-k", {})).toBe("200");

      // Scoped delta (no order, no watermark — a partial re-read): value merges,
      // floor untouched.
      socket.serverSend({ kind: "delta", key: "wm-k", params: {}, upserts: [["a", { id: "a", n: 2 }]], deletes: [], version: 2 });
      expect(qc.getQueryData(["wm-k"])).toEqual([{ id: "a", n: 2 }]);
      expect(getResourceWatermark("wm-k", {})).toBe("200");

      // FULL keyed delta (order asserted, watermark carried): floor adopts.
      socket.serverSend({
        kind: "delta",
        key: "wm-k",
        params: {},
        upserts: [["b", { id: "b", n: 1 }]],
        deletes: [],
        order: ["a", "b"],
        version: 3,
        watermark: "201",
      });
      expect(qc.getQueryData(["wm-k"])).toEqual([{ id: "a", n: 2 }, { id: "b", n: 1 }]);
      expect(getResourceWatermark("wm-k", {})).toBe("201");
    });

    test("a version-guard-dropped frame does NOT adopt its watermark", async () => {
      const { socket, qc, client } = await setup();
      client.observe("wm-d", {}, undefined, pushSchema);
      socket.serverSend({ kind: "sub-ack", key: "wm-d", params: {}, value: { status: "s0" }, version: 5, watermark: "300" });
      expect(getResourceWatermark("wm-d", {})).toBe("300");

      // Equal version → `<=`-dropped: neither the cache nor the floor moves,
      // even though the frame claims a newer watermark.
      socket.serverSend({ kind: "update", key: "wm-d", params: {}, value: { status: "stale" }, version: 5, watermark: "999" });
      expect(qc.getQueryData(["wm-d"])).toEqual({ status: "s0" });
      expect(getResourceWatermark("wm-d", {})).toBe("300");
    });

    test("a standalone ack frame is gated on the local sub; noted with NO version adoption and NO cache write", async () => {
      const { socket, qc, client } = await setup();
      client.observe("ack-a", {}, undefined, pushSchema);

      // Version-less standalone ack for a held sub: acks noted, nothing else —
      // the sub's version baseline stays -1 and the cache stays untouched.
      socket.serverSend({ kind: "ack", key: "ack-a", params: {}, ackTx: ["700", "701"] });
      expect(hasResourceTxAck("ack-a", {}, "700")).toBe(true);
      expect(hasResourceTxAck("ack-a", {}, "701")).toBe(true);
      expect(qc.getQueryData(["ack-a"])).toBeUndefined();
      expect(client.debugSnapshot().subs.find((s) => s.key === "ack-a")!.version).toBe(-1);

      // A never-observed key's ack is dropped by the broadcast gate (the shared
      // socket fans every frame to every tab).
      socket.serverSend({ kind: "ack", key: "ack-ghost", params: {}, ackTx: ["702"] });
      expect(hasResourceTxAck("ack-ghost", {}, "702")).toBe(false);
    });

    test("delta acks are noted BEFORE setQueryData — a QueryCache listener reads them synchronously", async () => {
      const { socket, qc, client } = await setup();
      client.observe("ack-k", {}, undefined, keyedSchema, keyOf);
      socket.serverSend({ kind: "sub-ack", key: "ack-k", params: {}, value: [{ id: "a", n: 1 }], version: 1 });

      // The optimistic hook's confirm pass runs inside the QueryCache event —
      // the ack must already be readable there (same load-bearing order as the
      // watermark registry).
      const observed: boolean[] = [];
      const unsubscribe = qc.getQueryCache().subscribe((event) => {
        if (event.type !== "updated") return;
        observed.push(hasResourceTxAck("ack-k", {}, "800"));
      });
      socket.serverSend({
        kind: "delta",
        key: "ack-k",
        params: {},
        upserts: [["a", { id: "a", n: 2 }]],
        deletes: [],
        version: 2,
        ackTx: ["800"],
      });
      unsubscribe();
      expect(qc.getQueryData(["ack-k"])).toEqual([{ id: "a", n: 2 }]);
      expect(observed).toContain(true);
      // An update frame's ackTx notes too.
      socket.serverSend({ kind: "update", key: "ack-k", params: {}, value: [{ id: "a", n: 3 }], version: 3, ackTx: ["801"] });
      expect(hasResourceTxAck("ack-k", {}, "801")).toBe(true);
    });

    test("a delta that dead-ends in a forced resub (no base) does NOT note its acks", async () => {
      const { socket, qc, client } = await setup();
      client.observe("ack-nb", {}, undefined, keyedSchema, keyOf);

      // FULL delta with ackTx but no cached base: the client resubs and must
      // note NOTHING — the cache never received this truth, so confirming an op
      // against it would be a false ack. The recovery sub-ack's watermark is
      // the sanctioned confirmation path.
      socket.serverSend({
        kind: "delta",
        key: "ack-nb",
        params: {},
        upserts: [["a", { id: "a", n: 1 }]],
        deletes: [],
        order: ["a"],
        version: 1,
        ackTx: ["900"],
      });
      expect(qc.getQueryData(["ack-nb"])).toBeUndefined();
      expect(hasResourceTxAck("ack-nb", {}, "900")).toBe(false);
    });

    test("a delta that cannot apply (no base → forced resub) does NOT adopt its watermark", async () => {
      const { socket, qc, client } = await setup();
      client.observe("wm-nb", {}, undefined, keyedSchema, keyOf);

      // FULL delta with a watermark but no cached base: the client resubs and
      // must NOT advance the floor — the cache never received this truth. The
      // recovery sub-ack carries its own watermark with its own full value.
      socket.serverSend({
        kind: "delta",
        key: "wm-nb",
        params: {},
        upserts: [["a", { id: "a", n: 1 }]],
        deletes: [],
        order: ["a"],
        version: 1,
        watermark: "400",
      });
      expect(qc.getQueryData(["wm-nb"])).toBeUndefined();
      expect(getResourceWatermark("wm-nb", {})).toBeUndefined();

      socket.serverSend({ kind: "sub-ack", key: "wm-nb", params: {}, value: [{ id: "a", n: 1 }], version: 1, watermark: "401" });
      expect(qc.getQueryData(["wm-nb"])).toEqual([{ id: "a", n: 1 }]);
      expect(getResourceWatermark("wm-nb", {})).toBe("401");
    });
  });
});
