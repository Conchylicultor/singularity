import { cpus } from "node:os";
import { createHostSemaphore } from "@plugins/packages/plugins/host-semaphore/server";

// Host-wide concurrency gate for the heavy build/check section (eslint + tsc +
// vite). Without it, N worktrees each fire ~8 multi-GB subprocesses at once and
// the machine thrashes — a normally-fast checks run stretches 10-50x.
//
// The gate itself is `packages/host-semaphore` — the same flock slot-broker every
// server-side host pool uses. This file is pure policy: which pools exist, how big
// they are, and which callers are exempt. It used to carry its own copy of the
// flock/FFI code, which drifted (a waiter blocking on ONE pid-hashed slot is never
// woken when a *different* slot frees — the stranding defect the primitive's
// fan-out fixes). See research/2026-07-10-global-host-semaphore-any-slot-wakeup.md.

/**
 * Build-pool size; each job itself spawns ~8 subprocesses, so cpu/4 stays bounded.
 *
 * NO env override: `size` names the flock SLOT FILES (`slot-0 … slot-(N-1)`), so it
 * MUST be identical in every process. A process sized to 4 only sweeps `slot-0..3`
 * and is blind to another holding `slot-7` — the bound is silently exceeded. Keeping
 * it a pure function of stable host facts (`os.cpus()`) is what prevents that; the
 * primitive's size sentinel only makes a residual mismatch loud. `type-check`'s
 * `hostWorkerBudget()` forbids an override for exactly this reason.
 */
function buildSlotCount(): number {
  return Math.max(1, Math.floor(cpus().length / 4));
}

// Constructed at module load: `createHostSemaphore` only validates its args and
// derives paths — it touches no disk until the first acquire — so importing this
// module never creates slot directories.
const pools = {
  build: createHostSemaphore({ name: "build", size: buildSlotCount() }),
  push: createHostSemaphore({ name: "push", size: 1 }),
};

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
 * Concurrency is strictly bounded: each flock file admits exactly one holder, and
 * flock auto-releases when the fd closes OR the holding process dies — so a
 * SIGKILLed agent (routine here) never leaks a slot.
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

  return await pools[kind].run(fn, {
    onWaitStart: hooks?.onWaitStart,
    // The primitive reports the milliseconds waited; the CLI's spans only need the
    // edge, so drop the argument rather than widen `HostSlotHooks`.
    onAcquired: () => hooks?.onAcquired?.(),
  });
}
