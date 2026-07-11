import { dlopen } from "bun:ffi";
import { closeSync, openSync } from "node:fs";
import { join } from "node:path";
import { SINGULARITY_DIR } from "@plugins/infra/plugins/paths/server";
import {
  createHostSemaphore,
  type AcquireHooks,
  type HostShare,
} from "@plugins/packages/plugins/host-semaphore/server";
import { registerGateGauge } from "@plugins/infra/plugins/runtime-profiler/core";
import type { PoolCost } from "@plugins/infra/plugins/host-admission/core";

// The one place a host pool comes into existence. `createHostSemaphore` is
// imported HERE ONLY — the `host-pools-declared` check makes that the structural
// bar, so a 7th pool cannot appear without taking budget from the others via the
// reserved table in `../../core`.

const { symbols: ffi } = dlopen(
  process.platform === "darwin" ? "libc.dylib" : "libc.so.6",
  { flock: { args: ["i32", "i32"], returns: "i32" } },
);
const LOCK_EX = 2;
const LOCK_NB = 4;

// True iff some process currently holds this slot's flock. The `pushLockHeld`
// technique (worktree-op.ts): a non-blocking `flock(LOCK_EX|LOCK_NB)` probe that
// releases immediately. flock attaches to the open file DESCRIPTION, not the
// process, so this detects a holder even on a separate fd in the SAME process
// (proven by worktree-op.test.ts). Open in append mode so a probe never
// truncates a lock file a holder may be using; a non-zero flock return means
// EWOULDBLOCK ⇒ someone else holds it.
function slotHeld(slotPath: string): boolean {
  let fd: number;
  try {
    fd = openSync(slotPath, "a");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return false; // no file ⇒ never held
    throw err;
  }
  try {
    return ffi.flock(fd, LOCK_EX | LOCK_NB) !== 0;
  } finally {
    closeSync(fd); // releases the flock if the probe happened to acquire it
  }
}

// Count a pool's held slots by probing `slot-0 … slot-(size-1)` SERIALLY. Serial
// matters: probing a *free* slot momentarily holds it, so a parallel probe of a
// whole pool could make a concurrent acquirer's `sweepKeep` see zero free slots
// and needlessly fan out. One slot at a time bounds that transient hold to a
// single slot.
function probeOccupancy(id: string, size: number): number {
  const dir = join(SINGULARITY_DIR, `${id}-slots`);
  let held = 0;
  for (let i = 0; i < size; i++) {
    if (slotHeld(join(dir, `slot-${i}.lock`))) held++;
  }
  return held;
}

/** A host-wide concurrency pool handle. */
export interface HostPool {
  readonly id: string;
  readonly size: number;
  readonly cost: PoolCost;
  /** Run `fn` holding exactly one slot; release in a `finally`. */
  run<T>(fn: () => Promise<T>, hooks?: AcquireHooks): Promise<T>;
  /** Acquire a whole share up front (`1 … min(max, size)` slots). */
  acquireShare(max: number, hooks?: AcquireHooks): Promise<HostShare>;
  /** Callers currently parked on the slow path (queue-depth gauge). */
  depth(): number;
}

/** Declares a host pool: what one holder costs the host, and how many slots exist. */
export interface HostPoolSpec {
  /** Names `~/.singularity/<id>-slots/`; a safe filename segment. */
  id: string;
  size: number;
  /** What ONE holder costs the host, including its fan-out. */
  cost: PoolCost;
  /**
   * Reserved-floor partition (only the CPU pool, and only `cpu`, today). When
   * set, `backgroundLimit` MUST be supplied — the pool reserves its high
   * `size - backgroundLimit` slots for the `interactive` lane so a saturated
   * `background` lane can never starve interactive work.
   */
  laned?: boolean;
  /**
   * The `background` lane's slot window (`1 … size`), required iff `laned`.
   * Passed straight through to `createHostSemaphore`; the reserved
   * `size - backgroundLimit` slots are interactive-only.
   */
  backgroundLimit?: number;
}

// Registry: one handle per id per process. A repeat `defineHostPool` for the
// same id (e.g. an occupant contending for the SAME physical slots) returns the
// one handle rather than building a second semaphore or double-registering the
// gauge. A mismatching spec is a wiring bug — fail loudly.
const registry = new Map<string, HostPool>();

export function defineHostPool(spec: HostPoolSpec): HostPool {
  const existing = registry.get(spec.id);
  if (existing) {
    if (existing.size !== spec.size || existing.cost.cpu !== spec.cost.cpu) {
      throw new Error(
        `defineHostPool(${spec.id}): already defined as size ${existing.size} / cpu ${existing.cost.cpu}, ` +
          `re-defined as size ${spec.size} / cpu ${spec.cost.cpu}`,
      );
    }
    return existing;
  }

  // A `laned` pool MUST carry an explicit `backgroundLimit` — omitting it would
  // silently fall through to `backgroundLimit === size` (no reserved floor),
  // quietly voiding the lane guarantee the `laned` flag promises.
  if (spec.laned && spec.backgroundLimit === undefined) {
    throw new Error(`defineHostPool(${spec.id}): laned pool requires an explicit backgroundLimit`);
  }

  const sem = createHostSemaphore({
    name: spec.id,
    size: spec.size,
    // Only a laned pool partitions its slots; an un-laned pool leaves
    // `backgroundLimit` at the primitive's default (`= size`, inert).
    ...(spec.laned ? { backgroundLimit: spec.backgroundLimit } : {}),
  });

  // Auto-register the host-gate occupancy gauge under `<id>-acquire` (the same
  // vocabulary `chargeWait` uses, so a snapshot's gate occupancy joins to span
  // waits). `active` is TRUE host-wide occupancy — every backend's held slots,
  // read by probing the flock files — not this process's local held count. This
  // retires the "host-wide occupancy is not cheaply readable" claim the ported
  // pools used to carry.
  registerGateGauge(`${spec.id}-acquire`, () => ({
    active: probeOccupancy(spec.id, spec.size),
    queued: sem.depth(),
    max: spec.size,
  }));

  const pool: HostPool = {
    id: spec.id,
    size: spec.size,
    cost: spec.cost,
    run: (fn, hooks) => sem.run(fn, hooks),
    acquireShare: (max, hooks) => sem.acquireShare(max, hooks),
    depth: () => sem.depth(),
  };
  registry.set(spec.id, pool);
  return pool;
}

/** One pool's point-in-time host-wide occupancy. */
export interface PoolOccupancy {
  id: string;
  held: number;
  size: number;
}

/**
 * True host-wide occupancy of every registered pool, probed SERIALLY (across
 * pools, and within each pool via `probeOccupancy`) so the transient one-slot
 * hold never overlaps a concurrent acquirer's sweep on more than one slot at a
 * time. Never call from an acquire path — this is for the health-monitor tick
 * and a Debug row.
 */
export async function hostOccupancy(): Promise<PoolOccupancy[]> {
  const out: PoolOccupancy[] = [];
  for (const pool of registry.values()) {
    out.push({ id: pool.id, held: probeOccupancy(pool.id, pool.size), size: pool.size });
    await Promise.resolve(); // yield between pools so a long registry never hogs the loop
  }
  return out;
}
