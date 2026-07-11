/**
 * NotificationsClient cross-tab hazard tests (H6, full stack). TWO real
 * NotificationsClients (own QueryClient each) share one `createTransportHub()`
 * as two browser tabs: one is elected leader and owns the only real socket, the
 * other is a follower relaying through it. The REAL election, cross-tab relay,
 * steal handover, and demote-teardown all run; only the three OS globals are
 * faked.
 *
 * Pins, cross-referencing the v3 mental-model doc §9 and
 * `research/2026-07-03-global-live-state-client-transport-harness.md`:
 *   - H6: a follower's sub relays tx → leader → the leader's socket (relay
 *     routing); freezing the leader (lock still held) makes the follower STEAL,
 *     the demoted leader closes its socket (§4 H6c fix), the new leader resubs on
 *     its fresh socket and converges — and there is NEVER a second live socket;
 *   - H6b: with both tabs subscribed to the same key, one server frame reaches
 *     BOTH clients' caches (the leader dispatches locally AND broadcasts rx).
 *
 * Conventions: `clientLog` mocked to a no-op; fake timers per test; Math.random
 * pinned to 0.5; every client `destroy()`-ed in afterEach (module-level buses
 * shared across the file).
 */

import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("@plugins/primitives/plugins/log-channels/web", () => ({ clientLog: () => {} }));

import { QueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { createTransportHub, type FakeWebSocket, type TabHandle } from "@plugins/primitives/plugins/networking/web";
import { NotificationsClient } from "../notifications-client";

const pushSchema = z.object({ status: z.string() });

const flush = async (): Promise<void> => {
  await vi.advanceTimersByTimeAsync(0);
};

interface TwoTabs {
  hub: ReturnType<typeof createTransportHub>;
  qcA: QueryClient;
  qcB: QueryClient;
  clientA: NotificationsClient;
  clientB: NotificationsClient;
  tabA: TabHandle;
  s1: FakeWebSocket;
}

describe("NotificationsClient — cross-tab handover (H6)", () => {
  const clients: NotificationsClient[] = [];

  // A elected leader with its socket S1 open; B a follower queued on the lock.
  async function elect(): Promise<TwoTabs> {
    const hub = createTransportHub();
    const qcA = new QueryClient();
    const qcB = new QueryClient();
    const tabA = hub.tab();
    const clientA = new NotificationsClient(qcA, { makeSocket: hub.makeSocket(tabA) });
    clients.push(clientA);
    await flush(); // A elected → S1 connecting
    const s1 = hub.server.all()[0]!;
    s1.open(); // A leader, S1 open

    const tabB = hub.tab();
    const clientB = new NotificationsClient(qcB, { makeSocket: hub.makeSocket(tabB) });
    clients.push(clientB);
    await flush(); // B follower, queued behind A on the lock
    return { hub, qcA, qcB, clientA, clientB, tabA, s1 };
  }

  const isLeader = (c: NotificationsClient): boolean =>
    c.debugSnapshot().leader.worktree.isLeader;
  const subFrames = (socket: FakeWebSocket, key: string): Record<string, unknown>[] =>
    socket.sentJson().filter((m) => m.op === "sub" && m.key === key);

  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0.5);
  });

  afterEach(() => {
    for (const c of clients.splice(0)) c.destroy();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  test("H6: a frozen leader is stolen from; the follower resubs on a fresh socket and converges, with never two live sockets", async () => {
    const { hub, qcA, qcB, clientA, clientB, tabA, s1 } = await elect();
    expect(isLeader(clientA)).toBe(true);
    expect(isLeader(clientB)).toBe(false);

    // A (leader) subscribes k on its own socket S1 and gets acked.
    clientA.observe("k", {}, undefined, pushSchema);
    s1.serverSend({ kind: "sub-ack", key: "k", params: {}, value: { status: "a" }, version: 1 });
    expect(qcA.getQueryData(["k"])).toEqual({ status: "a" });

    // B (follower) subscribes k: its sub relays tx → leader A → S1 (relay routing).
    clientB.observe("k", {}, undefined, pushSchema);
    await flush(); // the tx frame reaches A and is written to S1
    expect(subFrames(s1, "k")).toHaveLength(2); // A's own sub + B's relayed sub
    expect(hub.server.openSockets()).toHaveLength(1); // only S1 is ever live

    // Freeze A (its lock stays held → B must STEAL, not win a free lock) and let
    // B time out.
    hub.freeze(tabA);
    await vi.advanceTimersByTimeAsync(hub.timeoutMs);
    expect(isLeader(clientA)).toBe(false); // demoted by the AbortError
    expect(isLeader(clientB)).toBe(true); // stole the lock → elected
    expect(hub.server.openSockets()).toHaveLength(0); // S1 torn down (H6c); S2 not open yet

    // B opens its new socket S2; replaySubs resends B's subs as ONE sub-batch.
    const s2 = hub.server.all().find((s) => s.readyState === 0)!;
    s2.open();
    await vi.advanceTimersByTimeAsync(0);
    const s2Batches = s2.sentJson().filter((m) => m.op === "sub-batch") as Array<{
      entries: Array<{ key: string }>;
    }>;
    expect(s2Batches).toHaveLength(1);
    expect(s2Batches[0]!.entries.map((e) => e.key)).toEqual(["k"]);
    expect(hub.server.openSockets()).toHaveLength(1); // exactly one live socket

    // A resync sub-ack on S2 converges B's cache to server truth.
    s2.serverSend({ kind: "sub-ack", key: "k", params: {}, value: { status: "b" }, version: 2 });
    expect(qcB.getQueryData(["k"])).toEqual({ status: "b" });
  });

  test("reconnect: two tabs replay independently-scoped batches — neither clobbers the other", async () => {
    // Each tab replays ONLY its own sub set, tagged with its own tabId, in its
    // own `sub-batch complete:true` frame — so the server's per-tab
    // reconciliation for tab A can never release tab B's subs.
    const hub = createTransportHub();
    const qcA = new QueryClient();
    const qcB = new QueryClient();
    const tabA = hub.tab();
    const clientA = new NotificationsClient(qcA, { makeSocket: hub.makeSocket(tabA), tabId: "tab-A" });
    clients.push(clientA);
    await flush();
    const s1 = hub.server.all()[0]!;
    s1.open();
    const tabB = hub.tab();
    const clientB = new NotificationsClient(qcB, { makeSocket: hub.makeSocket(tabB), tabId: "tab-B" });
    clients.push(clientB);
    await flush();

    clientA.observe("kA", {}, undefined, pushSchema);
    clientB.observe("kB", {}, undefined, pushSchema);
    await flush(); // B's sub relays to S1

    // Drop + reconnect: A (leader) reopens; the "open" broadcast makes BOTH
    // tabs replay — A directly, B relayed through A.
    s1.serverClose();
    await vi.advanceTimersByTimeAsync(500);
    const s2 = hub.server.all().find((s) => s.readyState === 0)!;
    s2.open();
    await flush(); // deliver B's relayed batch

    const batches = s2.sentJson().filter((m) => m.op === "sub-batch") as Array<{
      tabId: string;
      complete: boolean;
      entries: Array<{ key: string }>;
    }>;
    expect(batches).toHaveLength(2); // one per tab — never a merged set
    const byTab = new Map(batches.map((b) => [b.tabId, b]));
    expect(byTab.get("tab-A")!.entries.map((e) => e.key)).toEqual(["kA"]);
    expect(byTab.get("tab-B")!.entries.map((e) => e.key)).toEqual(["kB"]);
    expect(byTab.get("tab-A")!.complete).toBe(true);
    expect(byTab.get("tab-B")!.complete).toBe(true);
  });

  test("H6b: one server frame fans out to BOTH tabs' caches (leader dispatches locally and broadcasts rx)", async () => {
    const { hub, qcA, qcB, clientA, clientB, s1 } = await elect();
    // Both tabs subscribe k through the single leader socket.
    clientA.observe("k", {}, undefined, pushSchema);
    clientB.observe("k", {}, undefined, pushSchema);
    await flush(); // B's sub relays to S1
    expect(subFrames(s1, "k")).toHaveLength(2);
    expect(hub.server.openSockets()).toHaveLength(1);

    // ONE server frame on S1 reaches both caches: A applies it locally, B via the
    // rx broadcast relayed from the leader.
    s1.serverSend({ kind: "update", key: "k", params: {}, value: { status: "x" }, version: 1 });
    await flush(); // deliver the rx broadcast to B
    expect(qcA.getQueryData(["k"])).toEqual({ status: "x" });
    expect(qcB.getQueryData(["k"])).toEqual({ status: "x" });
  });
});
