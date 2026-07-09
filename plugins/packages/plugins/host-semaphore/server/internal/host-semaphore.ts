import { dlopen } from "bun:ffi";
import { closeSync, mkdirSync, openSync } from "node:fs";
import { join } from "node:path";
import { SINGULARITY_DIR } from "@plugins/infra/plugins/paths/server";

// Cross-process twin of `createSemaphore` (the in-process counter+queue gate in
// `packages/semaphore`). Bounds CPU-heavy work *across* the ~16 worktree server
// processes sharing one box, not just within one. The bound is N flock(2) lock
// files under `~/.singularity/<name>-slots/`: at most one holder per fd, so at
// most `size` holders host-wide. flock auto-releases when the fd closes OR the
// holding process dies, so a SIGKILLed server never leaks a slot — the same
// crash-safety the build pool relies on (`cli/bin/host-semaphore.ts`).
//
// Hybrid acquire:
//  - Fast path: an in-process *non-blocking* `flock(LOCK_NB)` sweep — microsecond
//    syscalls that never freeze the event loop. When a slot is free this is the
//    whole story; no subprocess, no tax.
//  - Slow path (all slots busy): we must *wait* for a slot, but a blocking
//    `flock(LOCK_EX)` would freeze the long-running event loop. So we spawn a
//    one-shot broker subprocess (`scripts/broker.ts`) that does the blocking wait
//    off our event loop and writes "granted\n" once it holds a slot. The parent
//    just `await`s that line. Closing the broker's stdin gives it EOF → it exits
//    → its fd closes → the flock releases.

const BROKER_PATH = join(import.meta.dir, "..", "..", "scripts", "broker.ts");

const { symbols: ffi } = dlopen(
  process.platform === "darwin" ? "libc.dylib" : "libc.so.6",
  { flock: { args: ["i32", "i32"], returns: "i32" } },
);
const LOCK_EX = 2;
const LOCK_NB = 4;

const GRANTED = "granted\n";

export interface HostShare {
  /** Slots actually held — always >= 1, never > the requested max. */
  readonly slots: number;
  /** Idempotent. Closes local fds and reaps the broker (if one was spawned). */
  release(): Promise<void>;
}

export interface HostSemaphore {
  /**
   * Run `fn` once a host-wide slot is free, releasing the slot when it settles.
   * The slot is released in a `finally`, so a rejecting `fn` never leaks one —
   * `run` rejects with the same error. Mirrors `Semaphore.run` exactly, except
   * the bound is enforced across processes (flock) rather than in-process.
   *
   * Now a thin wrapper over `acquireShare(1)`: acquire exactly one slot, hold it
   * across `fn`, release in a `finally`. That dedup keeps the fast/slow acquire,
   * `depth()` semantics, and crash-safety identical between the two entry points.
   *
   * `onWait`, if given, is called once with the milliseconds spent waiting for a
   * slot (≈0 when one was immediately free on the fast path) at the moment of
   * acquisition, before `fn` runs. Lets callers make the gate observable (e.g.
   * record a profiler span) without coupling this primitive to a profiler.
   */
  run<T>(fn: () => Promise<T>, onWait?: (waitMs: number) => void): Promise<T>;

  /**
   * Block until at least ONE slot is held, then greedily take any additional
   * free slots up to `max` with a single non-blocking sweep. Returns a
   * `HostShare` naming how many slots were actually taken (`1 … min(max, size)`)
   * and a `release()` that hands them all back.
   *
   * The point is one broker per *caller*, not one per slot: a caller that fans
   * out N units of work acquires its whole share once, up front, instead of
   * spawning N brokers (one per unit) precisely when the box is already busy.
   * The idle-pool case is the fast path — pure in-process `flock(LOCK_NB)`
   * sweep, no subprocess. Only when every slot is busy do we spawn **exactly one**
   * broker to do the blocking wait for the first slot, then a second non-blocking
   * sweep picks up whatever else freed while we waited.
   *
   * `max` is clamped to `size` (asking for more slots than exist is a no-op past
   * the ceiling, not an error). `onWait` fires once at acquisition, same contract
   * as `run`. Never returns fewer than 1 slot — it blocks or throws instead, so a
   * caller never has to distinguish "got a share" from "got nothing".
   */
  acquireShare(max: number, onWait?: (waitMs: number) => void): Promise<HostShare>;

  /**
   * The number of callers currently parked on the SLOW path (all slots busy,
   * blocking on the broker subprocess for a slot). Fast-path callers that grabbed
   * a slot immediately are NOT counted — this is the queue-depth gauge, not the
   * in-flight count. 0 means the gate is uncontended. Observability-only (e.g.
   * the health-monitor Backends overview); never gates behavior.
   */
  depth(): number;
}

/**
 * Cross-process bounded-concurrency gate: at most `size` `run` bodies execute at
 * once across every process sharing the same `name`. `name` keys the slot
 * directory (`~/.singularity/<name>-slots/`) and must be a safe filename segment.
 */
export function createHostSemaphore(opts: { name: string; size: number }): HostSemaphore {
  const { name, size } = opts;
  if (!Number.isInteger(size) || size < 1) {
    throw new Error(`createHostSemaphore: size must be a positive integer, got ${size}`);
  }
  if (!/^[a-z0-9][a-z0-9-]*$/.test(name)) {
    throw new Error(
      `createHostSemaphore: name must match /^[a-z0-9][a-z0-9-]*$/, got ${JSON.stringify(name)}`,
    );
  }

  const slotsDir = join(SINGULARITY_DIR, `${name}-slots`);
  const files = Array.from({ length: size }, (_, i) => join(slotsDir, `slot-${i}.lock`));

  // Queue-depth gauge: how many callers are currently parked on the slow path
  // waiting for a broker-held slot. Incremented when entering the slow path and
  // decremented in a `finally` bracketing the blocking wait — never inline, since
  // a thrown acquire would otherwise permanently inflate the gauge.
  let waiting = 0;

  // Non-blocking sweep: open all `size` fds, `flock(LOCK_NB)` each, and KEEP the
  // first `limit` fds that lock (the caller owns and must close them to release).
  // Every other fd — past the limit, or one that failed to lock — is closed
  // immediately. All in-process microsecond syscalls; never freezes the loop the
  // way LOCK_EX would. `limit === 0` opens nothing worth keeping and returns [].
  function sweepKeep(limit: number): number[] {
    mkdirSync(slotsDir, { recursive: true });
    const fds = files.map((f) => openSync(f, "w"));
    const kept: number[] = [];
    for (const fd of fds) {
      if (kept.length < limit && ffi.flock(fd, LOCK_EX | LOCK_NB) === 0) {
        kept.push(fd);
      } else {
        closeSync(fd);
      }
    }
    return kept;
  }

  function spawnBroker() {
    return Bun.spawn([process.execPath, BROKER_PATH], {
      stdin: "pipe",
      stdout: "pipe",
      stderr: "inherit",
      env: { ...process.env, HOST_SEM_SLOTS_DIR: slotsDir, HOST_SEM_SIZE: String(size) },
    });
  }

  async function acquireShare(
    max: number,
    onWait?: (waitMs: number) => void,
  ): Promise<HostShare> {
    if (!Number.isInteger(max) || max < 1) {
      throw new Error(`acquireShare: max must be a positive integer, got ${max}`);
    }
    const t0 = onWait ? performance.now() : 0;
    // Asking for more slots than exist can't beat the ceiling — clamp so the
    // sweep and the broker's re-sweep agree on the true upper bound.
    const effectiveMax = Math.min(max, size);

    // Fast path: non-blocking sweep for up to `effectiveMax` slots. On an idle
    // pool this is the whole story — no subprocess, no tax.
    let fds = sweepKeep(effectiveMax);
    let broker: ReturnType<typeof spawnBroker> | undefined;

    if (fds.length === 0) {
      // Slow path: every slot is busy. We hold none (sweepKeep closed them all).
      // Spawn exactly ONE broker to do the blocking wait for the FIRST slot off
      // our event loop; the broker holds that slot in its own process.
      broker = spawnBroker();

      // Parked on the slow path: count toward queue depth for the whole blocking
      // wait. `finally` (not inline) so a thrown/early-closed broker decrements
      // too — otherwise a failed acquire would permanently inflate the gauge.
      waiting++;
      try {
        await awaitGranted(broker.stdout, name);
      } finally {
        waiting--;
      }

      // The broker now holds one slot. Re-run the non-blocking sweep for up to
      // `effectiveMax - 1` EXTRA slots that may have freed while we waited — the
      // broker's own slot fails to lock (held by another process), so we never
      // double-count it.
      fds = sweepKeep(effectiveMax - 1);
    }

    onWait?.(performance.now() - t0);

    let released = false;
    const release = async (): Promise<void> => {
      // Idempotent: a caller may release in a `finally` that also runs on a path
      // where it already released. Guard so the second call is a no-op.
      if (released) return;
      released = true;
      // Closing every kept fd releases those slots (flock auto-release).
      for (const fd of fds) closeSync(fd);
      if (broker) {
        // Closing stdin gives the broker EOF → it exits → its fd closes → the
        // flock releases. Fire-and-forget the flush (FileSink.end may return a
        // promise); correctness is guaranteed by kill() + awaiting exited, which
        // reaps the broker so we never leave a zombie.
        void broker.stdin.end();
        broker.kill();
        await broker.exited;
      }
    };

    // slots = (the broker's one slot, if we took the slow path) + the fds we hold
    // directly. Always >= 1: on the fast path fds.length >= 1 (we only fall to the
    // slow path when it's 0); on the slow path the broker contributes the 1.
    return { slots: (broker ? 1 : 0) + fds.length, release };
  }

  return {
    depth: () => waiting,

    acquireShare,

    async run<T>(fn: () => Promise<T>, onWait?: (waitMs: number) => void): Promise<T> {
      const share = await acquireShare(1, onWait);
      try {
        return await fn();
      } finally {
        await share.release();
      }
    },
  };
}

/**
 * Read `stream` until the literal `"granted\n"` token appears (the broker holds a
 * slot). Async — the event loop is never blocked. If the stream closes without
 * the token, the broker died before acquiring → throw loudly (a swallowed failure
 * here would silently drop the gate's bound).
 */
async function awaitGranted(stream: ReadableStream<Uint8Array>, name: string): Promise<void> {
  const decoder = new TextDecoder();
  let buffer = "";
  const reader = stream.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (value) buffer += decoder.decode(value, { stream: true });
      if (buffer.includes(GRANTED)) return;
      if (done) {
        throw new Error(
          `createHostSemaphore(${name}): broker exited before granting a slot ` +
            `(stdout closed without "granted")`,
        );
      }
    }
  } finally {
    reader.releaseLock();
  }
}
