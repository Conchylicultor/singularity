import { afterEach, describe, expect, test } from "bun:test";
import { rmSync } from "node:fs";
import { join } from "node:path";
import { SINGULARITY_DIR } from "@plugins/infra/plugins/paths/server";
import { createHostSemaphore, type HostShare } from "./host-semaphore";

// Unique slot dir per `createHostSemaphore` so parallel test runs (and the two
// tests below) never collide on the same lock files.
let counter = 0;
const usedNames: string[] = [];
function uniqueName(prefix: string): string {
  const name = `hosttest-${prefix}-${process.pid}-${Date.now()}-${counter++}`;
  usedNames.push(name);
  return name;
}

afterEach(() => {
  for (const name of usedNames.splice(0)) {
    rmSync(join(SINGULARITY_DIR, `${name}-slots`), { recursive: true, force: true });
  }
});

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

test("validates size and name", () => {
  expect(() => createHostSemaphore({ name: "ok", size: 0 })).toThrow();
  expect(() => createHostSemaphore({ name: "ok", size: 1.5 })).toThrow();
  expect(() => createHostSemaphore({ name: "Bad_Name", size: 1 })).toThrow();
  expect(() => createHostSemaphore({ name: "-bad", size: 1 })).toThrow();
  expect(() => createHostSemaphore({ name: "good-1", size: 1 })).not.toThrow();
});

describe("cross-process serialization", () => {
  test("size 1 serializes 3 overlapping runs through fast-path + broker", async () => {
    const sem = createHostSemaphore({ name: uniqueName("s1"), size: 1 });

    let active = 0;
    let peak = 0;
    const order: number[] = [];

    async function job(id: number): Promise<void> {
      await sem.run(async () => {
        active++;
        peak = Math.max(peak, active);
        order.push(id);
        await sleep(50);
        active--;
      });
    }

    // Launch all 3 overlapping: the first wins the in-process fast path; the
    // other two find every slot busy and queue via the blocking broker.
    await Promise.all([job(1), job(2), job(3)]);

    expect(peak).toBe(1); // never more than one body at a time
    expect(order.sort()).toEqual([1, 2, 3]); // all three ran
    expect(active).toBe(0); // every slot released
  });

  test("size 2 allows 2 concurrent but never 3", async () => {
    const sem = createHostSemaphore({ name: uniqueName("s2"), size: 2 });

    let active = 0;
    let peak = 0;
    let sawTwo = false;

    async function job(): Promise<void> {
      await sem.run(async () => {
        active++;
        peak = Math.max(peak, active);
        if (active === 2) sawTwo = true;
        await sleep(60);
        active--;
      });
    }

    await Promise.all([job(), job(), job(), job()]);

    expect(peak).toBe(2); // two slots → at most two bodies
    expect(sawTwo).toBe(true); // and it really did reach two (not just serialized)
    expect(active).toBe(0);
  });

  test("a rejecting fn never leaks a slot", async () => {
    const sem = createHostSemaphore({ name: uniqueName("rej"), size: 1 });

    let rejected: unknown;
    try {
      await sem.run(async () => {
        throw new Error("boom");
      });
    } catch (err) {
      rejected = err;
    }
    expect(rejected).toBeInstanceOf(Error);
    expect((rejected as Error).message).toBe("boom");

    // If the slot leaked, this immediate run would hang/queue. It must take the
    // fast path and resolve promptly.
    let ran = false;
    await sem.run(async () => {
      ran = true;
    });
    expect(ran).toBe(true);
  });
});

/**
 * Await `p` and return the Error it rejected with; throw if it resolved instead.
 * `expect(p).rejects.toThrow()` is typed `void` under bun:test, so awaiting it is
 * a no-op the assertion never actually runs behind — the test would pass even if
 * `p` resolved. This asserts the rejection for real, and hands back the error so
 * the caller can pin its message.
 */
async function rejection(p: Promise<unknown>): Promise<Error> {
  try {
    await p;
  } catch (err) {
    return err as Error;
  }
  throw new Error("expected the promise to reject, but it resolved");
}

describe("acquireShare", () => {
  test("throws on a non-positive-integer max", async () => {
    const sem = createHostSemaphore({ name: uniqueName("share-arg"), size: 4 });
    // Failure is a thrown type, never a `slots: 0` value a caller could absorb.
    for (const bad of [0, -1, 1.5]) {
      expect((await rejection(sem.acquireShare(bad))).message).toContain("positive integer");
    }
  });

  test("on an idle pool takes the full share with no broker", async () => {
    const sem = createHostSemaphore({ name: uniqueName("share-idle"), size: 4 });

    // Spy on Bun.spawn to prove the fast path spawns no broker subprocess: on an
    // idle pool the whole share is grabbed in-process by the non-blocking sweep.
    const origSpawn = Bun.spawn;
    let spawnCount = 0;
    (Bun as unknown as { spawn: typeof Bun.spawn }).spawn = ((...args: unknown[]) => {
      spawnCount++;
      return (origSpawn as (...a: unknown[]) => unknown)(...args);
    }) as typeof Bun.spawn;

    try {
      const share = await sem.acquireShare(4);
      expect(share.slots).toBe(4); // all four free slots taken greedily
      expect(spawnCount).toBe(0); // no broker
      await share.release();
    } finally {
      (Bun as unknown as { spawn: typeof Bun.spawn }).spawn = origSpawn;
    }
  });

  test("with 3 of 4 slots held, returns the single remaining slot", async () => {
    const sem = createHostSemaphore({ name: uniqueName("share-partial"), size: 4 });

    // A holder (a distinct set of open file descriptions — flock conflicts even
    // within one process) parks on 3 of the 4 slots.
    const holder = await sem.acquireShare(3);
    expect(holder.slots).toBe(3);

    // The greedy sweep can only take what's free: exactly one slot, no broker.
    const share = await sem.acquireShare(4);
    expect(share.slots).toBe(1);

    await share.release();
    await holder.release();
  });

  test("with all 4 slots held, blocks then returns once one frees (broker path)", async () => {
    const sem = createHostSemaphore({ name: uniqueName("share-full"), size: 4 });

    const holder = await sem.acquireShare(4);
    expect(holder.slots).toBe(4);

    // Every slot busy → the sweep finds nothing → one broker does the blocking
    // wait off the event loop. The share must not resolve while all slots are held.
    let resolved = false;
    const pending = sem.acquireShare(4).then((s) => {
      resolved = true;
      return s;
    });
    await sleep(100);
    expect(resolved).toBe(false); // genuinely blocked on the broker

    await holder.release(); // frees the slots → broker grants
    const share = await pending;
    expect(share.slots).toBeGreaterThanOrEqual(1);
    expect(share.slots).toBeLessThanOrEqual(4);

    await share.release();
  });

  test("two concurrent callers never hold more than 4 slots at once", async () => {
    const sem = createHostSemaphore({ name: uniqueName("share-race"), size: 4 });

    const held = new Set<HostShare>();
    const totalHeld = () => [...held].reduce((n, s) => n + s.slots, 0);
    let peak = 0;

    async function worker(): Promise<void> {
      const share = await sem.acquireShare(4);
      held.add(share);
      peak = Math.max(peak, totalHeld());
      await sleep(40);
      held.delete(share);
      await share.release();
    }

    await Promise.all([worker(), worker()]);

    expect(peak).toBeLessThanOrEqual(4); // the host ceiling is never exceeded
    expect(held.size).toBe(0); // every share released
  });

  test("release is idempotent and leaks no slot when the caller's body throws", async () => {
    const sem = createHostSemaphore({ name: uniqueName("share-rej"), size: 4 });

    // Idempotent: a double release is a no-op, not a double-close error.
    const first = await sem.acquireShare(4);
    await first.release();
    await first.release();

    // No leak on a throwing body: release in the `finally` hands every slot back.
    let rejected: unknown;
    try {
      const share = await sem.acquireShare(4);
      try {
        throw new Error("boom");
      } finally {
        await share.release();
      }
    } catch (err) {
      rejected = err;
    }
    expect(rejected).toBeInstanceOf(Error);
    expect((rejected as Error).message).toBe("boom");

    // If either the double-release or the throwing body had leaked a slot, this
    // fast-path acquire could not reclaim the whole pool.
    const again = await sem.acquireShare(4);
    expect(again.slots).toBe(4);
    await again.release();
  });
});
