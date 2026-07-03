/**
 * CrossTabElection hazard tests — the leader-election half of the client
 * transport stack, driven on the deterministic `FakeBroadcastChannelBus` +
 * `FakeLockManager` (no real BroadcastChannel / navigator.locks, no sockets).
 *
 * These pin the cross-tab handover invariants from the v3 mental-model doc §9
 * (H6): exactly one leader at a time, a follower queues on the lock, a clean
 * close hands the lock to the next waiter, and a frozen (silent) leader is
 * timed out and STOLEN from — its outer lock promise rejecting with an
 * AbortError, which drives `demoteToFollower` (and now the `onDemoted` callback,
 * the prescribed structural fix — see
 * `research/2026-07-03-global-live-state-client-transport-harness.md` §4).
 *
 * Conventions: fake timers per test (real timers restored in afterEach); time is
 * advanced only via the async variants so the fakes' real-microtask Broadcast
 * delivery + lock grants interleave correctly; every constructed election is
 * closed in afterEach (the module-level net-diag bus is shared across the file).
 */

import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import { CrossTabElection, type CrossTabElectionCallbacks } from "../cross-tab-election";
import {
  FakeBroadcastChannelBus,
  FakeLockManager,
  type FakeBroadcastChannel,
} from "../test-support";
import { subscribeNetDiag, type NetDiagEvent } from "../net-diag-bus";

type Msg = { n: number };

interface Rec {
  elected: number;
  demoted: number;
  followerJoined: number;
  leaderMsgs: Msg[];
  followerMsgs: Msg[];
}

function recorder(): { calls: Rec; callbacks: CrossTabElectionCallbacks<Msg> } {
  const calls: Rec = { elected: 0, demoted: 0, followerJoined: 0, leaderMsgs: [], followerMsgs: [] };
  const callbacks: CrossTabElectionCallbacks<Msg> = {
    onElected: () => { calls.elected++; },
    onDemoted: () => { calls.demoted++; },
    onFollowerJoined: () => { calls.followerJoined++; },
    onLeaderMessage: (m) => { calls.leaderMsgs.push(m); },
    onFollowerMessage: (m) => { calls.followerMsgs.push(m); },
  };
  return { calls, callbacks };
}

const NAME = "el";
const HEARTBEAT_MS = 40;
const TIMEOUT_MS = 120;

// Flush the fakes' microtask work (BroadcastChannel delivery + lock grants).
const flush = async (): Promise<void> => {
  await vi.advanceTimersByTimeAsync(0);
};

describe("CrossTabElection", () => {
  let bus: FakeBroadcastChannelBus;
  let locks: FakeLockManager;
  const open: CrossTabElection<Msg>[] = [];

  // Build an election on the shared bus/locks; captures its BroadcastChannel so
  // a test can freeze it. `locks` may be overridden (e.g. null → solo fallback).
  function makeElection(
    rec: CrossTabElectionCallbacks<Msg>,
    lockManager: FakeLockManager | null = locks,
  ): { election: CrossTabElection<Msg>; channel?: FakeBroadcastChannel } {
    let channel: FakeBroadcastChannel | undefined;
    const election = new CrossTabElection<Msg>(NAME, rec, {
      makeBroadcastChannel: (n) => {
        channel = bus.channel(n);
        return channel;
      },
      locks: lockManager,
      heartbeatMs: HEARTBEAT_MS,
      timeoutMs: TIMEOUT_MS,
    });
    open.push(election);
    return { election, channel };
  }

  beforeEach(() => {
    vi.useFakeTimers();
    bus = new FakeBroadcastChannelBus();
    locks = new FakeLockManager();
  });

  afterEach(() => {
    for (const e of open.splice(0)) e.close();
    vi.useRealTimers();
  });

  test("the first tab is elected leader; the second queues as a follower", async () => {
    const a = recorder();
    const b = recorder();
    const { election: elA } = makeElection(a.callbacks);
    const { election: elB } = makeElection(b.callbacks);
    await flush();

    expect(elA.isLeader).toBe(true);
    expect(a.calls.elected).toBe(1);
    expect(elB.isLeader).toBe(false);
    expect(b.calls.elected).toBe(0);
    // B is parked on the lock behind A.
    expect(locks.isHeld(NAME)).toBe(true);
    expect(locks.queueLength(NAME)).toBe(1);
  });

  test("locks: null ⇒ synchronous solo-leader fallback (no channel, no async grant)", () => {
    const a = recorder();
    const { election } = makeElection(a.callbacks, null);
    // Elected synchronously in the constructor — no microtask flush needed.
    expect(election.isLeader).toBe(true);
    expect(a.calls.elected).toBe(1);
  });

  test("down/up routing skips the sender and reaches only the opposite role", async () => {
    const a = recorder();
    const b = recorder();
    const { election: elA } = makeElection(a.callbacks); // leader
    const { election: elB } = makeElection(b.callbacks); // follower
    await flush();

    elA.broadcast({ n: 1 }); // leader → followers (down)
    elB.sendToLeader({ n: 2 }); // follower → leader (up)
    await flush();

    // B (follower) got the down; A (leader) got the up; neither saw its own frame.
    expect(b.calls.leaderMsgs).toEqual([{ n: 1 }]);
    expect(a.calls.followerMsgs).toEqual([{ n: 2 }]);
    expect(a.calls.leaderMsgs).toEqual([]);
    expect(b.calls.followerMsgs).toEqual([]);
  });

  test("a follower's hello notifies the sitting leader (onFollowerJoined)", async () => {
    const a = recorder();
    const { election: elA } = makeElection(a.callbacks);
    await flush();
    expect(elA.isLeader).toBe(true);

    const b = recorder();
    makeElection(b.callbacks); // posts hello on construct
    await flush();
    expect(a.calls.followerJoined).toBeGreaterThanOrEqual(1);
  });

  test("a live heartbeat keeps hasLeader() true past the staleness timeout", async () => {
    const a = recorder();
    const b = recorder();
    makeElection(a.callbacks); // leader — heartbeats every HEARTBEAT_MS
    const { election: elB } = makeElection(b.callbacks); // follower
    await flush();

    // Advance well past TIMEOUT_MS; the leader's heartbeats keep refreshing B.
    await vi.advanceTimersByTimeAsync(TIMEOUT_MS * 3);
    expect(elB.hasLeader()).toBe(true);
    expect(elB.isLeader).toBe(false);
    expect(b.calls.demoted).toBe(0);
    expect(b.calls.elected).toBe(0);
  });

  test("H6-lock: a clean close hands the lock to the queued follower (single holder throughout)", async () => {
    const a = recorder();
    const b = recorder();
    const { election: elA } = makeElection(a.callbacks);
    const { election: elB } = makeElection(b.callbacks);
    await flush();
    expect(elA.isLeader).toBe(true);
    expect(elB.isLeader).toBe(false);

    // A's tab closes cleanly: stop the election, then the OS releases its lock.
    elA.close();
    locks.releaseTab(NAME); // resolves A (no AbortError) → grants B
    await flush();

    // B is promoted; a lone holder existed at every step (the FakeLockManager
    // single-holder invariant throws on violation — reaching here means it held).
    expect(elB.isLeader).toBe(true);
    expect(b.calls.elected).toBe(1);
    expect(b.calls.demoted).toBe(0);
    expect(locks.isHeld(NAME)).toBe(true);
    expect(locks.queueLength(NAME)).toBe(0);
  });

  test("H6-lock: a frozen leader is timed out, stolen from, and demoted; the follower is elected", async () => {
    const events: NetDiagEvent[] = [];
    const unsub = subscribeNetDiag((ev) => events.push(ev));
    try {
      const a = recorder();
      const b = recorder();
      const { election: elA, channel: chA } = makeElection(a.callbacks);
      const { election: elB } = makeElection(b.callbacks);
      await flush();
      expect(elA.isLeader).toBe(true);

      // Freeze the leader's tab: its heartbeats stop reaching B, but its lock is
      // still held — so B must STEAL, not just win a free lock.
      bus.freeze(chA!);
      await vi.advanceTimersByTimeAsync(TIMEOUT_MS); // B times out → steal

      expect(a.calls.demoted).toBe(1); // AbortError → demoteToFollower → onDemoted
      expect(elA.isLeader).toBe(false);
      expect(b.calls.elected).toBe(1);
      expect(elB.isLeader).toBe(true);
      const types = events.map((e) => e.type);
      expect(types).toContain("leader-timeout");
      expect(types).toContain("steal-attempt");
    } finally {
      unsub();
    }
  });

  test("a direct steal demotes the leader, which re-queues for the lock as a follower", async () => {
    const a = recorder();
    const { election: elA } = makeElection(a.callbacks);
    await flush();
    expect(elA.isLeader).toBe(true);

    // Another tab steals the lock directly (holds it with a never-resolving cb).
    void locks.request(NAME, { mode: "exclusive", steal: true }, () => new Promise<void>(() => {}));
    await flush();

    expect(a.calls.demoted).toBe(1);
    expect(elA.isLeader).toBe(false);
    // A's demoteToFollower re-issued requestLock(false): it now waits behind the stealer.
    expect(locks.isHeld(NAME)).toBe(true);
    expect(locks.queueLength(NAME)).toBe(1);
  });
});
