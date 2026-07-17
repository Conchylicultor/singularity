import { createSemaphore } from "@plugins/packages/plugins/semaphore/core";
import {
  cpuBudget,
  PER_UNIT_BYTES,
  HOST_GRANT_ENV,
  HOST_LANE_ENV,
  type Grant,
  type GrantHooks,
  type Lane,
} from "@plugins/infra/plugins/host-admission/core";
import { defineHostPool } from "./pool";

// The laned host CPU pool + the grant that subdivides it. This is where the CPU
// ceiling `B` (the residual of the summed budget) becomes a real flock pool, and
// where a build/check/push turns one host admission into a bundle of tokens it
// spends across its own fan-out (type-check workers, vite, nested check
// subprocess) without any of them re-acquiring host-wide.

/**
 * The single host CPU pool. `size = B` (the summed-budget residual), laned so the
 * high `B - backgroundLimit` slots are reserved for the interactive lane and a
 * saturated background (agent) lane can never starve a main build / push.
 */
export const cpuPool = defineHostPool({
  id: "cpu",
  size: cpuBudget().B,
  laned: true,
  backgroundLimit: cpuBudget().backgroundLimit,
  cost: { cpu: 1, ramBytes: PER_UNIT_BYTES },
});

// Build a grant over a fixed unit count, backed by an in-process semaphore. Used
// both by `withHostGrant` (after a host acquire) and `inheritedGrant` (the
// units already held by the parent). The semaphore is what bounds a holder's
// fan-out to `units`; nothing here touches flock.
function grantOfUnits(units: number, lane: Lane): Grant {
  const sem = createSemaphore(units);
  return {
    units,
    run: (fn) => sem.run(fn),
    env: () => ({ [HOST_GRANT_ENV]: String(units), [HOST_LANE_ENV]: lane }),
  };
}

/**
 * Acquire a host CPU share for `lane` (up to `max` slots), run `fn` with a grant
 * over exactly the slots held, and release the share afterwards. `acquireShare`
 * guarantees `>= 1` slot, so a grant always has `units >= 1`: a 1-unit grant
 * merely serializes the holder's children — no starvation branch, no `min > 1`
 * acquire that could livelock two builds each holding one slot.
 *
 * `opts.hooks` are the acquire's observability seam, forwarded to the pool. They
 * were dropped here for the pool's whole life, which is what made EVERY host-grant
 * wait — build's, check's, push's nested one — unobservable by construction. The
 * pool has always honoured them (`AcquireHooks`); this only stops swallowing them.
 * `lane` is applied AFTER the spread: it is this function's own opt and must win,
 * so a hooks object can never redirect the acquire to the other lane's slot window.
 */
export async function withHostGrant<T>(
  opts: { lane: Lane; max: number; hooks?: GrantHooks },
  fn: (grant: Grant) => Promise<T>,
): Promise<T> {
  const share = await cpuPool.acquireShare(opts.max, { ...opts.hooks, lane: opts.lane });
  try {
    return await fn(grantOfUnits(share.slots, opts.lane));
  } finally {
    await share.release();
  }
}

/**
 * The grant this process inherited from its parent via the environment, or
 * `undefined` if there is none (a fresh top-level invocation). Reads
 * `SINGULARITY_HOST_GRANT` (a positive int) and rebuilds an in-process semaphore
 * of that many units — it acquires NOTHING host-wide, because the parent already
 * holds the slots and this child is their only spender. An absent or invalid
 * value returns `undefined` so the caller falls back to `withHostGrant`.
 */
export function inheritedGrant(): Grant | undefined {
  const raw = process.env[HOST_GRANT_ENV];
  if (raw === undefined) return undefined;
  const units = Number(raw);
  if (!Number.isInteger(units) || units < 1) return undefined;
  const lane: Lane = process.env[HOST_LANE_ENV] === "interactive" ? "interactive" : "background";
  return grantOfUnits(units, lane);
}
