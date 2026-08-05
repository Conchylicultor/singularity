import { closeSync, ftruncateSync, mkdirSync, openSync, readFileSync, writeSync } from "fs";
import { dirname } from "path";
import { flockTry } from "@plugins/packages/plugins/flock/server";
import { adaptiveTimeoutMs } from "./commands/adaptive-timeout";

export interface AcquireBuildLockOptions {
  /** How often a waiter re-inspects the lock. */
  pollMs?: number;
  /** After this long waiting, the message starts naming what the holder is stuck in. */
  staleMs?: number;
  /** Absolute wait ceiling (sanity bound). */
  capMs?: number;
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
    // been at it a long time — so say WHAT it is stuck in. The progress log is
    // the authority on that, and is imported dynamically so the bootstrap's
    // static closure (this module is reachable from bin/index.ts via
    // ensure-deps.ts) stays as small as it is.
    if (!diagnosed && Date.now() - startedAt > staleMs) {
      diagnosed = true;
      console.log(await describeStuckPhase(lockPath, Date.now() - startedAt));
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
 * A human line naming the span the lock holder is currently inside, from the
 * durable build-progress log. Falls back to the bare wait when the holder has no
 * recorded run (e.g. the `.install.lock`, which no build progress covers).
 */
async function describeStuckPhase(lockPath: string, waitedMs: number): Promise<string> {
  const waited = `${Math.round(waitedMs / 1000)}s`;
  const pid = readHolderPid(lockPath);
  const prefix = `Still waiting (${waited}) for the build lock`;
  if (pid === null) return `${prefix}.`;

  const { readBuildProgress, PROGRESS_FILE } = await import("./build-progress");
  const run = readBuildProgress().find((r) => r.pid === pid && r.done === null);
  const stuck = run?.outstanding.at(-1);
  if (!stuck) return `${prefix}; held by pid ${pid}.`;
  // Against the wall clock, not the run's last-activity stamp: a run that has
  // gone silent is exactly the interesting case, and `outstanding[].elapsedMs`
  // would understate it by however long the silence has lasted.
  const inSpan = Math.round((Date.now() - Date.parse(stuck.startedAt)) / 1000);
  return (
    `${prefix}; pid ${pid} has been in "${stuck.label}" for ${inSpan}s. ` +
    `Full history: ${PROGRESS_FILE}`
  );
}
