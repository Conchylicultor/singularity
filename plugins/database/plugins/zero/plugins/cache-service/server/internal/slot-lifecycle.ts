import { rm } from "node:fs/promises";
import { join } from "node:path";
import { openShortLivedClient } from "@plugins/database/plugins/admin/server";
import { SINGULARITY_DIR } from "@plugins/infra/plugins/paths/server";
import { dropZeroSlotsAndPublications } from "../../shared/internal/slot-sql";

// Per-worktree replica path the gateway hands zero-cache via ZERO_REPLICA_FILE:
// ~/.singularity/worktrees/<name>/zero/replica.db. Re-derived here (the sweep
// and reap own no gateway state) so we can delete the stale replica alongside
// the slot. Kept in lockstep with the gateway's ZERO_REPLICA_FILE computation.
export function worktreeReplicaFile(worktreeName: string): string {
  return join(SINGULARITY_DIR, "worktrees", worktreeName, "zero", "replica.db");
}

/**
 * Drop every Zero logical replication slot + publication on the fork DB `dbName`
 * and remove its stale replica file. The clean-slate guarantee: after this, the
 * next zero-cache start does a fresh initial COPY.
 *
 * Idempotent and tolerant of "nothing to drop". Drop semantics (active-slot
 * tolerance, slot/publication matching) live in the shared, runtime-agnostic
 * `dropZeroSlotsAndPublications`; here we only supply the admin pool's
 * short-lived client and remove the stale replica afterward.
 */
export async function dropZeroReplicationArtifacts(dbName: string): Promise<void> {
  const client = openShortLivedClient(dbName);
  try {
    await dropZeroSlotsAndPublications(dbName, (text, params) =>
      client.query(text, params),
    );
  } finally {
    await client.end();
  }

  await rm(worktreeReplicaFile(dbName), { force: true });
}
