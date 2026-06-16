#!/usr/bin/env bun
/**
 * Host-semaphore broker subprocess — the ONLY place a *blocking* flock(2) is
 * allowed. The parent (`server/internal/host-semaphore.ts`) spawns one of these
 * whenever every slot is busy and it must wait for one. A subprocess has no event
 * loop to freeze, so it can safely block on `flock(LOCK_EX)`; the parent just
 * `await`s the "granted\n" line and never blocks its own loop.
 *
 * Lifecycle:
 *  1. Open the N slot fds; try a non-blocking sweep first.
 *  2. If none free, BLOCK on one (pid-hashed for spread) until it frees.
 *  3. Print "granted\n". If that write fails (parent already died) → exit, which
 *     closes the fd and releases the slot.
 *  4. Hold the slot until the parent closes our stdin (EOF) or sends SIGTERM,
 *     then exit. Process exit closes the fds → flock auto-releases.
 *
 * Imports NOTHING cross-plugin (only node:* + bun:ffi) so it stays a standalone,
 * independently-runnable script with no boundary concerns. The slot dir + size
 * arrive via env from the parent.
 */
import { mkdirSync, openSync } from "node:fs";
import { join } from "node:path";
import { dlopen } from "bun:ffi";

const slotsDir = process.env.HOST_SEM_SLOTS_DIR;
const sizeRaw = process.env.HOST_SEM_SIZE;
if (!slotsDir || !sizeRaw) {
  throw new Error("broker: HOST_SEM_SLOTS_DIR and HOST_SEM_SIZE must be set");
}
const size = parseInt(sizeRaw, 10);
if (!Number.isInteger(size) || size < 1) {
  throw new Error(`broker: HOST_SEM_SIZE must be a positive integer, got ${sizeRaw}`);
}

mkdirSync(slotsDir, { recursive: true });

const { symbols: ffi } = dlopen(
  process.platform === "darwin" ? "libc.dylib" : "libc.so.6",
  { flock: { args: ["i32", "i32"], returns: "i32" } },
);
const LOCK_EX = 2;
const LOCK_NB = 4;

const fds = Array.from({ length: size }, (_, i) => openSync(join(slotsDir, `slot-${i}.lock`), "w"));

// Non-blocking sweep first — a slot may have freed between the parent's sweep and
// our spawn. Otherwise block on one (pid-hashed for spread) until it frees.
let acquired = false;
for (const fd of fds) {
  if (ffi.flock(fd, LOCK_EX | LOCK_NB) === 0) {
    acquired = true;
    break;
  }
}
if (!acquired) {
  ffi.flock(fds[process.pid % fds.length]!, LOCK_EX);
}

// Signal acquisition. A failed write means the parent died while we waited →
// exit immediately, which closes the fds and releases the slot. We inspect the
// error rather than swallowing it: a dead-peer write error (EPIPE/EBADF) is the
// expected race and the correct response is to release by exiting; anything else
// is unexpected and rethrows so it stays loud.
try {
  process.stdout.write("granted\n");
} catch (err) {
  const code = (err as NodeJS.ErrnoException | undefined)?.code;
  if (code === "EPIPE" || code === "EBADF" || code === "ERR_STREAM_DESTROYED") {
    process.exit(0);
  }
  throw err;
}

// SIGTERM (parent kill) → release by exiting.
process.on("SIGTERM", () => process.exit(0));

// Hold the slot until the parent closes our stdin (EOF). The parent never writes
// to stdin — closing it is the release signal. Draining to EOF then exiting
// closes the fds → flock auto-releases.
for await (const _chunk of Bun.stdin.stream()) {
  // Parent never writes; we only wait for the stream to close.
}
process.exit(0);
