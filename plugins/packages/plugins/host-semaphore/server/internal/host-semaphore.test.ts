import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { SINGULARITY_DIR } from "@plugins/infra/plugins/paths/server";
import { createHostSemaphore, type HostShare } from "./host-semaphore";

// The `flock-wait.ts` child script, resolved the same way the module resolves it.
// Tests spawn it directly to stand in for an out-of-process slot holder.
const FLOCK_WAIT_PATH = join(import.meta.dir, "..", "..", "scripts", "flock-wait.ts");

// This very module, imported by the separate-process probe below. The probe must run
// inside the repo (default cwd under `bun test`) so the transitive `@plugins/*` alias
// resolves.
const HOST_SEMAPHORE_MODULE = join(import.meta.dir, "host-semaphore.ts");

// A one-shot fixture (run via `bun -e`): construct the named pool and acquire+release
// one slot immediately, printing OK on success or THREW:<msg> on any error. Used to
// hammer a fresh pool's first-acquire from many separate processes at once.
const FIRST_ACQUIRE_FIXTURE = `
  const { createHostSemaphore } = await import(process.env.HS_MOD);
  const sem = createHostSemaphore({ name: process.env.HS_NAME, size: 4 });
  try {
    const share = await sem.acquireShare(1);
    await share.release();
    process.stdout.write("OK\\n");
    process.exit(0);
  } catch (err) {
    process.stdout.write("THREW:" + (err && err.message) + "\\n");
    process.exit(1);
  }
`;

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

/** Read `stream` until the literal `"granted\n"` token; throw if it closes first. */
async function awaitGrantedRaw(stream: ReadableStream<Uint8Array>): Promise<void> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (value) buf += decoder.decode(value, { stream: true });
      if (buf.includes("granted\n")) return;
      if (done) throw new Error("flock-wait child exited before granting");
    }
  } finally {
    reader.releaseLock();
  }
}

/** Read the first newline-terminated JSON line from `stream`. */
async function readJsonLine<T>(stream: ReadableStream<Uint8Array>): Promise<T> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (value) buf += decoder.decode(value, { stream: true });
      const nl = buf.indexOf("\n");
      if (nl >= 0) return JSON.parse(buf.slice(0, nl)) as T;
      if (done) throw new Error("stream closed before a JSON line was produced");
    }
  } finally {
    reader.releaseLock();
  }
}

/** Spawn `flock-wait.ts` directly against one absolute lock file (a raw holder). */
function spawnHolder(lockFile: string) {
  return Bun.spawn([process.execPath, FLOCK_WAIT_PATH], {
    stdin: "pipe",
    stdout: "pipe",
    stderr: "inherit",
    env: { ...process.env, HOST_SEM_LOCK_FILE: lockFile },
  });
}

/** True iff `pid` is still alive (signal-0 probe); ESRCH ⇒ gone. */
function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ESRCH") return false;
    throw err;
  }
}

// The stranding gate. `acquireShare(1)` takes exactly the first free slot in file
// order, so four handles deterministically hold slot-0…3. A fifth waiter finds every
// slot busy and fans out. Releasing ANY one held slot must wake it — the whole point
// of the fan-out. The old pid-hashed broker parked on one slot, so at least 3 of the
// 4 releases hung; parameterizing k proves every slot wakes the waiter.
describe("wakes on any freed slot (stranding gate)", () => {
  for (const k of [0, 1, 2, 3]) {
    test(`releasing held slot ${k} wakes the fan-out waiter`, async () => {
      const sem = createHostSemaphore({ name: uniqueName(`strand-${k}`), size: 4 });

      const handles: HostShare[] = [];
      for (let i = 0; i < 4; i++) handles.push(await sem.acquireShare(1));
      expect(handles.every((h) => h.slots === 1)).toBe(true); // one slot each, slot-0…3

      const waiterP = sem.acquireShare(1);
      await sleep(150); // let the waiter reach the slow path and fan out
      await handles[k]!.release();

      // Race the waiter against a 2s timeout sentinel; the old design would time out
      // for k ∉ { winnerPid % 4 }.
      const outcome = await Promise.race([
        waiterP,
        sleep(2000).then(() => "TIMEOUT" as const),
      ]);
      expect(outcome).not.toBe("TIMEOUT");
      const share = outcome as HostShare;
      expect(share.slots).toBeGreaterThanOrEqual(1);

      await share.release();
      for (let i = 0; i < 4; i++) if (i !== k) await handles[i]!.release();
    });
  }
});

test("a SIGKILLed out-of-process holder wakes a fan-out waiter", async () => {
  // flock releases on holder *death*, not just graceful close — so a SIGKILL must
  // wake the waiter. This is the case any userspace tick-file/watcher design fails.
  const name = uniqueName("sigkill");
  const slotsDir = join(SINGULARITY_DIR, `${name}-slots`);
  mkdirSync(slotsDir, { recursive: true });

  const holder = spawnHolder(join(slotsDir, "slot-0.lock"));
  await awaitGrantedRaw(holder.stdout); // holder now owns the only slot

  const sem = createHostSemaphore({ name, size: 1 });
  const waiterP = sem.acquireShare(1);
  await sleep(150); // waiter finds the slot busy and fans out
  holder.kill(9); // hard kill — the flock releases as the process dies
  await holder.exited;

  const outcome = await Promise.race([waiterP, sleep(2000).then(() => "TIMEOUT" as const)]);
  expect(outcome).not.toBe("TIMEOUT");
  await (outcome as HostShare).release();
});

test("a fan-out child is not orphaned when its parent is SIGKILLed", async () => {
  // A child blocked on flock must still exit when its parent dies with no chance to
  // SIGTERM it — the orphan hole the old main-thread-flock broker had. The worker-
  // thread design keeps the child's main thread free to observe stdin EOF.
  const name = uniqueName("orphan");
  const slotsDir = join(SINGULARITY_DIR, `${name}-slots`);
  mkdirSync(slotsDir, { recursive: true });
  const lockFile = join(slotsDir, "slot-0.lock");

  // Grandparent (this test) holds the slot so the fan-out child blocks indefinitely.
  const holder = spawnHolder(lockFile);
  await awaitGrantedRaw(holder.stdout);

  // Intermediate parent spawns a flock-wait child (piped stdin) and stays alive. It
  // prints the child pid so the grandparent can watch it after the parent is killed.
  const script = `
    const child = Bun.spawn([process.execPath, "--smol", process.env.FW_PATH], {
      stdin: "pipe", stdout: "inherit", stderr: "inherit",
      env: { ...process.env, HOST_SEM_LOCK_FILE: process.env.FW_LOCK },
    });
    console.log(JSON.stringify({ childPid: child.pid }));
    await new Promise(() => {});
  `;
  const intermediate = Bun.spawn([process.execPath, "-e", script], {
    stdin: "ignore",
    stdout: "pipe",
    stderr: "inherit",
    env: { ...process.env, FW_PATH: FLOCK_WAIT_PATH, FW_LOCK: lockFile },
  });
  const { childPid } = await readJsonLine<{ childPid: number }>(intermediate.stdout);

  // SIGKILL the parent — nobody is left to SIGTERM the still-blocked child. Its stdin
  // (piped from the parent) hits EOF, and its main thread (free, not blocked in flock)
  // observes it and exits.
  intermediate.kill(9);
  await intermediate.exited;

  await sleep(1500);
  expect(isAlive(childPid)).toBe(false);

  void holder.stdin.end();
  holder.kill();
  await holder.exited;
});

test("losers are reaped before the extras sweep, so no undercount", async () => {
  // When a full share is released at once, all `size` fan-out children may each grab a
  // different slot. The winner keeps one; the losers are SIGKILLed and awaited so their
  // slots are back BEFORE the extras re-sweep — the waiter must reclaim more than one.
  const sem = createHostSemaphore({ name: uniqueName("extras"), size: 4 });

  const holder = await sem.acquireShare(4);
  expect(holder.slots).toBe(4);

  const waiterP = sem.acquireShare(4);
  await sleep(150);
  await holder.release(); // all four slots free simultaneously

  const share = await waiterP;
  expect(share.slots).toBeGreaterThan(1); // the extras sweep ran after losers exited
  expect(share.slots).toBeLessThanOrEqual(4);
  await share.release();
});

test("size is part of pool identity: a live size mismatch throws, an idle one resizes", async () => {
  const name = uniqueName("identity");

  // Establish the pool at size 4 and HOLD a slot so it is live.
  const sem4 = createHostSemaphore({ name, size: 4 });
  const held = await sem4.acquireShare(1);
  expect(held.slots).toBe(1);

  // A size-8 process on the same live pool would silently overcommit — it must crash.
  const sem8 = createHostSemaphore({ name, size: 8 });
  const err = await rejection(sem8.acquireShare(1));
  expect(err.message).toContain("live at size");

  // Once idle, a fresh size-8 pool resizes the sentinel silently and gets all 8.
  await held.release();
  const sem8b = createHostSemaphore({ name, size: 8 });
  const share = await sem8b.acquireShare(8);
  expect(share.slots).toBe(8);
  await share.release();
});

test(
  "concurrent first-acquire on a fresh pool never crashes on the size-guard race",
  async () => {
    // Many separate processes first-touching the same fresh pool contend on the
    // `.size.lock` guard exactly while the sentinel is still absent (between flock and
    // rename). A benign flock race must NOT crash — the old code threw "concurrent size
    // initialization" for the loser. Each probe agrees on size, so every one must end
    // OK (acquire → release), never THREW. In-process concurrency won't reproduce it
    // (the promise memo dedupes); it needs separate processes racing on the flock.
    const results: string[] = [];
    for (let trial = 0; trial < 3; trial++) {
      const name = uniqueName(`race-${trial}`);
      const children = Array.from({ length: 12 }, () =>
        Bun.spawn([process.execPath, "-e", FIRST_ACQUIRE_FIXTURE], {
          stdout: "pipe",
          stderr: "inherit",
          env: { ...process.env, HS_MOD: HOST_SEMAPHORE_MODULE, HS_NAME: name },
        }),
      );
      const outs = await Promise.all(
        children.map(async (c) => (await new Response(c.stdout).text()).trim()),
      );
      await Promise.all(children.map((c) => c.exited));
      results.push(...outs);
    }

    const threw = results.filter((r) => r.startsWith("THREW"));
    expect(threw).toEqual([]); // no process crashed on the guard race
    expect(results.every((r) => r === "OK")).toBe(true); // every one acquired
  },
  30_000,
);
