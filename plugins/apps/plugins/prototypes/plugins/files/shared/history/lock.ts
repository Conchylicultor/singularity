import { closeSync, openSync } from "node:fs";
import { flockTry } from "@plugins/packages/plugins/flock/core";

// One writer per history repo at a time, across every process on the host.
//
// Every worktree backend, main and the CLI write into the SAME repos (the store
// is host-global), and a turn's checkpoint is at-least-once — several backends
// can record the same turn at once. Git's own `index.lock` would make the loser
// fail with a stale-lock message, and leaves the lock behind if the writer dies;
// an flock is released by the kernel when its holder dies, so a killed backend
// can never wedge a prototype's history.

/**
 * How long a writer waits for the repo before giving up. A version is a few
 * git commands on a handful of small files — milliseconds — so a holder still
 * there after this long is wedged, not busy.
 */
const LOCK_WAIT_MS = 10_000;
const LOCK_POLL_MS = 25;

/** The repo stayed locked for {@link LOCK_WAIT_MS}. Retryable — the caller's job re-runs. */
export class HistoryBusyError extends Error {
  constructor(readonly lockPath: string) {
    super(
      `prototype history is locked by another writer (${lockPath}) — still held after ${LOCK_WAIT_MS / 1000}s`,
    );
    this.name = "HistoryBusyError";
  }
}

/**
 * Run `fn` holding the exclusive lock at `lockPath` (created if absent, never
 * unlinked — unlinking a lock file another process has open splits the lock in
 * two). Waits up to {@link LOCK_WAIT_MS}, then throws {@link HistoryBusyError}.
 *
 * Separate `open`s of one file conflict even inside one process (an flock is
 * owned by the open file description), so this serializes a backend's own
 * concurrent requests too.
 */
export async function withHistoryLock<T>(
  lockPath: string,
  fn: () => Promise<T>,
): Promise<T> {
  const fd = openSync(lockPath, "a");
  try {
    const deadline = Date.now() + LOCK_WAIT_MS;
    while (!flockTry(fd)) {
      if (Date.now() >= deadline) throw new HistoryBusyError(lockPath);
      await Bun.sleep(LOCK_POLL_MS);
    }
    return await fn();
  } finally {
    closeSync(fd);
  }
}
