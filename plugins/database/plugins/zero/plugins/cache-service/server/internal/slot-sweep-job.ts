import { rm } from "node:fs/promises";
import { z } from "zod";
import { defineJob } from "@plugins/infra/plugins/jobs/server";
import { getAdminPool } from "@plugins/database/plugins/admin/server";
import { worktreeReplicaFile } from "./slot-lifecycle";

// Reclaims Zero logical replication slots whose zero-cache is gone. A live
// zero-cache holds its slot `active = true`; the gateway's idle-kill SIGTERMs
// the process, flipping the slot to `active = false`. This sweep then drops the
// inactive slot (reclaiming its retained WAL) and removes the stale replica
// file, so the next resume pays a fresh initial COPY (the drop-and-recopy
// idle/teardown semantics — the gateway can't run PG DDL). Crash-orphaned slots
// self-heal the same way.
//
// Only INACTIVE `zero%` slots are touched — live worktrees are never disturbed.
// Runs every 5 min on the MAIN runtime only (no perWorktree): replication slots
// are a global cluster resource, so one sweep covers all worktrees. Mirrors
// database.fork-temp-sweep's registration/runtime-gating shape.
export const zeroSlotSweepJob = defineJob({
  name: "database.zero-slot-sweep",
  input: z.object({}),
  event: z.never(),
  dedup: "singleton",
  schedule: { cron: "*/5 * * * *" },
  async run() {
    // pg_replication_slots is a cluster-global view; `database` is the fork the
    // slot replicates and `pg_drop_replication_slot` works from any connection.
    const inactive = await getAdminPool().query<{
      slot_name: string;
      database: string;
    }>(
      `SELECT slot_name, database FROM pg_replication_slots
        WHERE slot_name LIKE 'zero%' AND active = false`,
    );

    for (const { slot_name, database } of inactive.rows) {
      try {
        await getAdminPool().query("SELECT pg_drop_replication_slot($1)", [
          slot_name,
        ]);
      } catch (err) {
        // A concurrent resume may have re-activated the slot between the SELECT
        // and the drop. Skip it (it's live again) rather than abort the sweep.
        if (isSlotActiveError(err)) continue;
        throw err;
      }
      // database is the worktree/fork name; drop its now-orphaned replica.
      await rm(worktreeReplicaFile(database), { force: true });
    }
  },
});

function isSlotActiveError(err: unknown): boolean {
  const code = (err as { code?: string } | null)?.code;
  if (code === "55006") return true;
  const message = (err as { message?: string } | null)?.message ?? "";
  return /replication slot .* is active/i.test(message);
}
