import { lstatSync, lutimesSync, renameSync, symlinkSync, unlinkSync } from "fs";
import { readlink, symlink, unlink } from "fs/promises";
import { adaptiveTimeoutMs } from "./commands/adaptive-timeout";

// Freshness lives in exactly ONE place. When Bun exposes `lutimesSync` we stamp
// freshness onto the symlink's own mtime (a single syscall, target unchanged)
// and the waiter reads it back via `lstatSync(...).mtimeMs`. If it is ever
// unavailable we fall back to encoding freshness in the target's `<ts>`,
// refreshing via an atomic temp-symlink + rename. Never both.
const LUTIMES_AVAILABLE = typeof lutimesSync === "function";

export interface AcquireBuildLockOptions {
  /** How often the holder refreshes the lock's freshness stamp. */
  heartbeatMs?: number;
  /** How often a waiter re-inspects the lock. */
  pollMs?: number;
  /** A live holder whose stamp is older than this is treated as wedged. */
  staleMs?: number;
  /** Absolute wait ceiling (sanity bound), even against a fresh holder. */
  capMs?: number;
}

interface HolderInfo {
  pid: number | null;
  ageMs: number;
}

/**
 * Read the current holder's pid and the age of its freshness stamp, or `null`
 * if the lock is absent. The pid always comes from the symlink target; the age
 * comes from the single freshness source (mtime, or the target `<ts>` fallback).
 */
async function readHolder(lockPath: string): Promise<HolderInfo | null> {
  let target: string;
  try {
    target = await readlink(lockPath);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
  const m = target.match(/^pid-(\d+)-(\d+)$/);
  const pid = m ? parseInt(m[1]!, 10) : null;
  if (LUTIMES_AVAILABLE) {
    const st = lstatSync(lockPath, { throwIfNoEntry: false });
    if (!st) return null; // vanished between readlink and lstat
    return { pid, ageMs: Date.now() - st.mtimeMs };
  }
  const ts = m ? parseInt(m[2]!, 10) : 0;
  return { pid, ageMs: Date.now() - ts };
}

/**
 * Atomically refresh the lock's freshness stamp. There is never a window where
 * the lock file is absent, so a waiter can never `symlink` into a gap.
 */
function refreshLock(lockPath: string): void {
  if (LUTIMES_AVAILABLE) {
    const now = new Date();
    lutimesSync(lockPath, now, now);
    return;
  }
  const temp = `${lockPath}.hb.${process.pid}`;
  symlinkSync(`pid-${process.pid}-${Date.now()}`, temp);
  renameSync(temp, lockPath); // atomic replace — no absent window
}

function makeRelease(lockPath: string, heartbeatMs: number): () => void {
  const timer = setInterval(() => refreshLock(lockPath), heartbeatMs);
  timer.unref();
  const release = () => {
    clearInterval(timer);
    try {
      unlinkSync(lockPath);
      // eslint-disable-next-line promise-safety/no-bare-catch
    } catch {}
  };
  process.on("exit", release);
  return release;
}

/**
 * Cross-process build mutex via atomic symlink, with a heartbeat so a healthy
 * but slow holder is waited on patiently and a wedged holder is surfaced loudly.
 *
 * Invariant: a live process's lock is NEVER stolen — two concurrent builds
 * corrupt shared state (`node_modules`, migrations, `dist.*` swap). The lock is
 * only ever removed by its own holder's `release`, or by a waiter *after* the
 * holder is confirmed dead (the `kill(pid, 0)` → `ESRCH` steal).
 */
export async function acquireBuildLock(
  lockPath: string,
  opts: AcquireBuildLockOptions = {},
): Promise<() => void> {
  const heartbeatMs = opts.heartbeatMs ?? 5_000;
  const pollMs = opts.pollMs ?? 500;
  // Adaptive defaults computed lazily so tests overriding via `opts` don't pay
  // the `os.loadavg()` / `os.cpus()` cost.
  const staleMs = opts.staleMs ?? adaptiveTimeoutMs(60_000, 180_000);
  const capMs = opts.capMs ?? adaptiveTimeoutMs(600_000, 1_800_000);

  const holder = `pid-${process.pid}-${Date.now()}`;
  const startedAt = Date.now();
  let warned = false;

  for (;;) {
    try {
      await symlink(holder, lockPath);
      return makeRelease(lockPath, heartbeatMs);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
    }

    const info = await readHolder(lockPath);
    if (!info) continue; // lock vanished between symlink and readlink — retry acquire

    if (info.pid !== null) {
      try {
        process.kill(info.pid, 0);
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== "ESRCH") throw err;
        // Dead holder — steal and retry acquire.
        try {
          await unlink(lockPath);
          // eslint-disable-next-line promise-safety/no-bare-catch
        } catch {}
        continue;
      }
      // Holder is alive.
      if (info.ageMs > staleMs) {
        throw new Error(
          `Build lock at ${lockPath} held by pid ${info.pid} which appears ` +
            `wedged: no heartbeat for ${info.ageMs}ms (stale after ${staleMs}ms)`,
        );
      }
    }

    if (Date.now() - startedAt > capMs) {
      throw new Error(
        `Timed out after ${capMs}ms waiting for build lock at ${lockPath}` +
          (info.pid !== null ? ` (held by pid ${info.pid})` : ""),
      );
    }

    if (!warned) {
      console.log("Another build is in progress; waiting...");
      warned = true;
    }
    await Bun.sleep(pollMs);
  }
}
