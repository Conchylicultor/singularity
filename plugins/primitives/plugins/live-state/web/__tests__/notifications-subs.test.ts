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
 *   - delta-no-base → forced resub (etag cleared, cache untouched);
 *   - delta-drift → forced resub (order names an unresolvable id);
 *   - the WS version guard (`<=` drop, `>` apply).
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

  test("delta-no-base → forced resub: cache untouched, etag cleared, a fresh full sub sent", async () => {
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
  });

  test("delta-drift → forced resub: an order id resolvable from neither upserts nor base ⇒ cache unchanged, etag cleared, resub", async () => {
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
    expect(subFrames(socket, "rk")).toHaveLength(before + 1); // forced resub
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
});
