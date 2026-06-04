import { dlopen } from "bun:ffi";
import { closeSync, mkdirSync, openSync } from "node:fs";
import { cpus } from "node:os";
import { join } from "node:path";
import { SINGULARITY_DIR } from "./paths";

// Host-wide concurrency gate for the heavy build/check section (eslint + tsc +
// vite). Without it, N worktrees each fire ~8 multi-GB subprocesses at once and
// the machine thrashes — a normally-fast checks run stretches 10-50x. We bound
// concurrency with flock(2) advisory locks, called via Bun FFI exactly like the
// push.lock in commands/push.ts.
//
// flock auto-releases when the fd closes OR the holding process dies, so a
// SIGKILLed agent (routine here) never leaks a slot. That crash-safety is why
// flock beats POSIX sem_open, which would stay decremented after a hard kill.

const SLOTS_DIR = join(SINGULARITY_DIR, "build-slots");

const { symbols: ffi } = dlopen(
  process.platform === "darwin" ? "libc.dylib" : "libc.so.6",
  { flock: { args: ["i32", "i32"], returns: "i32" } },
);
const LOCK_EX = 2;
const LOCK_NB = 4;

/** Build-pool size; each job itself spawns ~8 subprocesses, so cpu/4 stays bounded. */
function buildSlotCount(): number {
  const env = process.env.SINGULARITY_BUILD_CONCURRENCY;
  if (env) {
    const n = parseInt(env, 10);
    if (n > 0) return n;
  }
  return Math.max(1, Math.floor(cpus().length / 4));
}

export type HostSlotKind = "exempt" | "build" | "push";
export interface HostSlotHooks {
  onWaitStart?: () => void;
  onAcquired?: () => void;
}

/**
 * Run `fn` while holding a host-wide concurrency slot.
 *
 * - `exempt` — main-branch build; runs immediately, never gated.
 * - `push`   — takes the single reserved push slot. Pushes are already
 *              serialized to one at a time by push.lock, so this slot is
 *              effectively never contended: a push never queues behind builds.
 * - `build`  — shares the N-slot build pool with every other agent-worktree job.
 *
 * Concurrency is strictly bounded: each flock file admits exactly one holder.
 */
export async function withHostSlot<T>(
  kind: HostSlotKind,
  fn: () => Promise<T>,
  hooks?: HostSlotHooks,
): Promise<T> {
  if (kind === "exempt") {
    hooks?.onAcquired?.();
    return await fn();
  }

  mkdirSync(SLOTS_DIR, { recursive: true });
  const files =
    kind === "push"
      ? [join(SLOTS_DIR, "push-0.lock")]
      : Array.from({ length: buildSlotCount() }, (_, i) => join(SLOTS_DIR, `build-${i}.lock`));
  const fds = files.map((f) => openSync(f, "w"));

  try {
    let acquired = false;
    for (const fd of fds) {
      if (ffi.flock(fd, LOCK_EX | LOCK_NB) === 0) {
        acquired = true;
        break;
      }
    }
    if (!acquired) {
      hooks?.onWaitStart?.();
      // All slots busy → block on one (pid-hashed for spread) until it frees.
      ffi.flock(fds[process.pid % fds.length]!, LOCK_EX);
    }
    hooks?.onAcquired?.();
    return await fn();
  } finally {
    // Closing every fd releases whichever slot we hold (flock auto-release).
    for (const fd of fds) closeSync(fd);
  }
}
