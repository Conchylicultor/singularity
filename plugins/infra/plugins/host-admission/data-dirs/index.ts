import { defineDataDir, type DataDir } from "@plugins/infra/plugins/paths/core";
import { RESERVED_POOLS } from "@plugins/infra/plugins/host-admission/core";

// Every host pool's flock slot files, declared HERE rather than derived inside
// the primitive that uses them.
//
// This is the fix for the single worst offender in the old data root:
// `createHostSemaphore` used to do ``join(SINGULARITY_DIR, `${name}-slots`)``
// itself, so ONE primitive silently minted a top-level directory per pool — ten
// on disk, of which only seven had a live `defineHostPool`. Nothing could see
// that, because the paths existed only as a template literal inside a function.
//
// The pool set is NOT a second list: it is `RESERVED_POOLS` (the budget table,
// the one place a reserved pool is declared) plus `cpu`, which is the residual
// and therefore never appears in the reserved table. A new pool added to the
// budget gets its lock dir here with no edit; a pool that is NOT in the budget
// has no lock dir and `defineHostPool` refuses to build it, which is the same
// structural bar `host-budget` already enforces from the other side.

/**
 * The CPU pool's id. It is the budget's RESIDUAL, so by construction it is the
 * one pool absent from `RESERVED_POOLS` — named explicitly here for that reason,
 * not as an exception.
 */
const CPU_POOL_ID = "cpu";

const POOL_IDS: readonly string[] = [
  CPU_POOL_ID,
  ...Object.keys(RESERVED_POOLS),
];

function lockDir(id: string): DataDir {
  return defineDataDir({
    kind: "locks",
    name: id,
    owner: "infra/host-admission",
    description: `flock slot files bounding the "${id}" host-wide concurrency pool`,
    // The files are pure kernel-lock state: a slot conveys nothing once its
    // holder is gone, and flock releases on process death anyway. Reclaimable
    // the moment nothing on the box is running — never while it is.
    reclaim: { kind: "restart" },
  });
}

const byId = new Map<string, DataDir>(POOL_IDS.map((id) => [id, lockDir(id)]));

/**
 * The lock directory for a host pool, or `undefined` when the id names no
 * declared pool. `defineHostPool` turns the absent case into a loud throw — a
 * pool with no declared slot directory would otherwise be exactly the invisible
 * top-level entry this registry exists to prevent.
 */
export function poolLockDir(id: string): DataDir | undefined {
  return byId.get(id);
}

export default [...byId.values()];
