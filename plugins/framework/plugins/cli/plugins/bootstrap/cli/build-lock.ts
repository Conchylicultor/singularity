import {
  closeSync,
  ftruncateSync,
  mkdirSync,
  openSync,
  readFileSync,
  writeSync,
} from "fs";
import { dirname } from "path";
import { flockTry } from "@plugins/packages/plugins/flock/server";
import { adaptiveTimeoutMs } from "./adaptive-timeout";

export interface AcquireBuildLockOptions {
  /** How often a waiter re-inspects the lock. */
  pollMs?: number;
  /** After this long waiting, the message starts naming what the holder is stuck in. */
  staleMs?: number;
  /** Absolute wait ceiling (sanity bound). */
  capMs?: number;
  /**
   * What the holder is currently doing, for the "still waiting" line — supplied
   * by the CALLER rather than read here.
   *
   * The authority on that is the durable build-progress log, which lives in
   * `op-runtime` because it reaches the file-sink primitive and a data-dir
   * declaration. This module is statically reachable from `bin/index.ts` through
   * `ensure-deps`, i.e. it loads BEFORE `bun install` has run, so it cannot
   * import that — `cli:bootstrap-package-free` exists to keep that closure empty
   * (measured: 11 modules, 0 npm packages).
   *
   * Inverting it is what removes the problem rather than hiding it. A dynamic
   * `import()` kept the closure clean but made a real cross-plugin edge
   * invisible to the boundary system, which is exactly what R9 (`inline-import`)
   * forbids. With the diagnostic injected, the edge does not exist: `bootstrap`
   * names no plugin the pre-install path cannot afford, and the one caller that
   * HAS the progress log (`app-artifacts`, deep in the build) passes it in.
   *
   * Omitted by the install lock, which no build progress covers.
   */
  describeHolderActivity?: (pid: number) => string | null;
}

/**
 * Cross-process build mutex, owned by the kernel.
 *
 * The lock is an exclusive `flock(2)` on a regular file. flock is owned by the
 * open file description, so the kernel drops it when the fd closes OR when the
 * holding process dies — SIGKILL, OOM and power loss included — and no pid is
 * consulted, so PID reuse cannot confuse it. A build killed by a caller timeout
 * therefore cannot leave a lock that outlives it: "a stale lock with no holder"
 * is not a state this can reach.
 *
 * WHY THIS IS NOT A HEARTBEAT (do not put one back). This was a symlink whose
 * target encoded `pid-<pid>-<ts>`, refreshed on a 5 s timer, with waiters probing
 * `kill(pid, 0)` and stealing on ESRCH. That scheme had two holes the kernel
 * closes for free:
 *   - **PID reuse.** A recycled pid makes a dead holder look alive, so the waiter
 *     refuses to steal and blocks until the cap.
 *   - **Liveness is not progress.** The timer keeps stamping for as long as the
 *     event loop turns, so a build wedged on a hung child looked perfectly
 *     healthy — the freshness stamp proved only that the process existed.
 * Every other cross-process mutex in the repo (push, cpu, db-fork,
 * worktree-mutate) was already on flock; this was the last holdout.
 *
 * The lock file is NEVER unlinked — release is just `closeSync`. Unlinking is
 * what let the old `release()` (which had no ownership check) remove a
 * *successor's* lock; with the fd as the lock there is nothing to mis-delete.
 * The lock file is gitignored, so leaving it behind is free.
 *
 * The holder's pid is written into the file for DIAGNOSTICS ONLY. Nothing about
 * correctness reads it back, so a misleading pid can at worst produce a
 * misleading message.
 */
export async function acquireBuildLock(
  lockPath: string,
  opts: AcquireBuildLockOptions = {},
): Promise<() => void> {
  const pollMs = opts.pollMs ?? 500;
  // Adaptive defaults computed lazily so tests overriding via `opts` don't pay
  // the `os.loadavg()` / `os.cpus()` cost.
  const staleMs = opts.staleMs ?? adaptiveTimeoutMs(60_000, 180_000);
  const capMs = opts.capMs ?? adaptiveTimeoutMs(600_000, 1_800_000);

  const startedAt = Date.now();
  let warned = false;
  let diagnosed = false;

  mkdirSync(dirname(lockPath), { recursive: true });
  // "a" (append), never "w": truncating would clobber the pid a live holder
  // wrote. The fd is ours alone; the flock below decides who owns the lock.
  const fd = openSync(lockPath, "a");

  for (;;) {
    if (flockTry(fd)) {
      // Safe to rewrite only now: we hold the lock, so no other holder's pid can
      // be clobbered. Truncate first so the file stays one line forever instead
      // of growing by a pid per build.
      ftruncateSync(fd, 0);
      writeSync(fd, `${process.pid}\n`);
      return makeRelease(fd);
    }

    if (Date.now() - startedAt > capMs) {
      closeSync(fd);
      throw new Error(
        `Timed out after ${capMs}ms waiting for the build lock at ${lockPath}` +
          `${describeHolder(lockPath)}. Another build in this checkout has held it ` +
          `for the entire wait.`,
      );
    }

    if (!warned) {
      console.log("Another build is in progress; waiting...");
      warned = true;
    }
    // Past the stale threshold the holder is alive (the kernel says so) but has
    // been at it a long time — so say WHAT it is stuck in, when the caller gave
    // us a way to find out (see `describeHolderActivity`).
    if (!diagnosed && Date.now() - startedAt > staleMs) {
      diagnosed = true;
      console.log(
        describeStuckPhase(
          lockPath,
          Date.now() - startedAt,
          opts.describeHolderActivity,
        ),
      );
    }
    await Bun.sleep(pollMs);
  }
}

/**
 * Release = close the fd; the kernel drops the lock. Idempotent, and registered
 * as an exit hook too so a holder that never calls it still releases at exit —
 * though for the crash case the kernel has already done it.
 */
function makeRelease(fd: number): () => void {
  let released = false;
  const release = (): void => {
    if (released) return;
    released = true;
    closeSync(fd);
  };
  process.on("exit", release);
  return release;
}

/** ` (held by pid N)`, or `` when the file has no readable pid. Diagnostics only. */
function describeHolder(lockPath: string): string {
  const pid = readHolderPid(lockPath);
  return pid === null ? "" : ` (held by pid ${pid})`;
}

function readHolderPid(lockPath: string): number | null {
  let raw: string;
  try {
    raw = readFileSync(lockPath, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
  const pid = parseInt(raw.trim(), 10);
  return Number.isInteger(pid) ? pid : null;
}

/**
 * A human line naming what the lock holder is currently doing. Degrades in two
 * steps: to the bare pid when the caller supplied no describer (the install
 * lock, which no build progress covers) or the describer had nothing on this
 * holder, and to the bare wait when the file carries no readable pid.
 */
function describeStuckPhase(
  lockPath: string,
  waitedMs: number,
  describeHolderActivity: ((pid: number) => string | null) | undefined,
): string {
  const waited = `${Math.round(waitedMs / 1000)}s`;
  const pid = readHolderPid(lockPath);
  const prefix = `Still waiting (${waited}) for the build lock`;
  if (pid === null) return `${prefix}.`;
  const activity = describeHolderActivity?.(pid) ?? null;
  if (activity === null) return `${prefix}; held by pid ${pid}.`;
  return `${prefix}; ${activity}`;
}
