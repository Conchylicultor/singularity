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

export interface HostSemaphore {
  /**
   * Run `fn` once a host-wide slot is free, releasing the slot when it settles.
   * The slot is released in a `finally`, so a rejecting `fn` never leaks one —
   * `run` rejects with the same error. Mirrors `Semaphore.run` exactly, except
   * the bound is enforced across processes (flock) rather than in-process.
   *
   * `onWait`, if given, is called once with the milliseconds spent waiting for a
   * slot (≈0 when one was immediately free on the fast path) at the moment of
   * acquisition, before `fn` runs. Lets callers make the gate observable (e.g.
   * record a profiler span) without coupling this primitive to a profiler.
   */
  run<T>(fn: () => Promise<T>, onWait?: (waitMs: number) => void): Promise<T>;

  /**
   * The number of `run` callers currently parked on the SLOW path (all slots
   * busy, blocking on the broker subprocess for a slot). Fast-path callers that
   * grabbed a slot immediately are NOT counted — this is the queue-depth gauge,
   * not the in-flight count. 0 means the gate is uncontended. Observability-only
   * (e.g. the health-monitor Backends overview); never gates behavior.
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

  // Queue-depth gauge: how many `run` callers are currently parked on the slow
  // path waiting for a broker-held slot. Incremented when entering the slow path
  // and decremented in a `finally` bracketing the blocking wait — never inline,
  // since a thrown acquire would otherwise permanently inflate the gauge.
  let waiting = 0;

  return {
    depth: () => waiting,

    async run<T>(fn: () => Promise<T>, onWait?: (waitMs: number) => void): Promise<T> {
      const t0 = onWait ? performance.now() : 0;

      mkdirSync(slotsDir, { recursive: true });
      const fds = files.map((f) => openSync(f, "w"));

      // Fast path: non-blocking sweep, all in-process. A single LOCK_NB syscall
      // is microseconds — it never freezes the event loop the way LOCK_EX would.
      let heldFd: number | undefined;
      for (const fd of fds) {
        if (ffi.flock(fd, LOCK_EX | LOCK_NB) === 0) {
          heldFd = fd;
          break;
        }
      }
      if (heldFd !== undefined) {
        onWait?.(performance.now() - t0);
        try {
          return await fn();
        } finally {
          // Closing every fd releases whichever slot we hold (flock auto-release).
          for (const fd of fds) closeSync(fd);
        }
      }

      // Slow path: every slot is busy. Release our own fds (we hold none) and let
      // the broker do the blocking wait off our event loop.
      for (const fd of fds) closeSync(fd);

      const broker = Bun.spawn([process.execPath, BROKER_PATH], {
        stdin: "pipe",
        stdout: "pipe",
        stderr: "inherit",
        env: { ...process.env, HOST_SEM_SLOTS_DIR: slotsDir, HOST_SEM_SIZE: String(size) },
      });

      // Parked on the slow path: count toward queue depth for the whole blocking
      // wait. `finally` (not inline) so a thrown/early-closed broker decrements
      // too — otherwise a failed acquire would permanently inflate the gauge.
      waiting++;
      try {
        await awaitGranted(broker.stdout, name);
      } finally {
        waiting--;
      }
      onWait?.(performance.now() - t0);

      try {
        return await fn();
      } finally {
        // Closing stdin gives the broker EOF → it exits → its fd closes → the
        // flock releases. Fire-and-forget the flush (FileSink.end may return a
        // promise); correctness is guaranteed by kill() + awaiting exited, which
        // reaps the broker so we never leave a zombie.
        void broker.stdin.end();
        broker.kill();
        await broker.exited;
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
