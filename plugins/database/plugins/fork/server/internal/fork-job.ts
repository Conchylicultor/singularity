import { z } from "zod";
import {
  defineJob,
  NonRetryableError,
} from "@plugins/infra/plugins/jobs/server";
import { recordNotification } from "@plugins/shell/plugins/notifications/server";
import {
  describeUndeclaredSchema,
  forkDatabase,
  ForkPlanError,
  forkExclusions,
} from "@plugins/database/plugins/admin/server";
import type { ForkOutcome } from "@plugins/database/plugins/admin/server";

// Durable, self-healing worktree DB fork. The enqueue is a committed row in
// graphile-worker; if the worker dies mid-fork the job is never marked complete
// and re-runs when the backend's worker reboots. `forkDatabase` is idempotent
// (no-op once the canonical DB exists), so retries are safe.
//
// Lives in its own `database/fork` plugin rather than `database/admin` because
// `infra/jobs` already depends on `database/admin` (for `connectionString`);
// putting a `defineJob` consumer back in `admin` would form an import cycle.
export const databaseForkJob = defineJob({
  name: "database.fork",
  // minutes: `pg_dump | pg_restore` subprocesses; nothing shorter bounds them.
  hold: "minutes",
  input: z.object({ source: z.string(), target: z.string() }),
  // Direct-enqueue only (kicked off when a conversation/worktree is created).
  event: z.never(),
  // jobKey "database.fork:<target>" — replace-if-not-running per target.
  dedup: { key: (input) => input.target },
  maxAttempts: 5,
  run: async ({ input: { source, target }, ctx: { signal } }) => {
    // Only the fork itself is inside the try: a failure to raise a bell about
    // what the fork FOUND must never be reported as the fork having failed.
    let outcome: ForkOutcome;
    try {
      // Read the declared exclusion set here, inside a booted backend, where
      // server contributions have been collected. `forkExclusions()` throws
      // rather than returning an empty set, so a process that never booted can
      // never quietly fork everything.
      //
      // `signal` is this dispatch's deadline. Passing it is what makes giving up
      // on this handler mean something: it cancels the host-wide `db-fork` acquire
      // and kills the dump/restore pair, so an overrunning fork stops occupying one
      // of the box's two fork slots instead of holding it until the process
      // restarts.
      outcome = await forkDatabase(source, target, forkExclusions(), signal);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await recordNotification({
        type: "db",
        title: "DB fork failed",
        description: `${target}: ${message}`,
        variant: "error",
        dedupeKey: `fork-error:${target}`,
      });
      // A refusal from the fork PLAN is deterministic — the same declarations
      // against the same catalog fail identically every time — so it
      // dead-letters after this one attempt instead of re-running a 2 GB dump
      // four more times and re-notifying on each. It is still loud, still a
      // dead-letter, still visible at /api/jobs; the fix is a contribution edit,
      // not a retry.
      if (err instanceof ForkPlanError) throw new NonRetryableError(message);
      // Everything else may be transient (a busy cluster, a restart mid-restore)
      // and retries.
      throw err;
    }

    // A schema nobody claimed means main's rows for it are now in this fork, and
    // in every fork after it. Not worth failing a fork over (see
    // `ForkPlan.undeclaredSchemas` for why refusing would be the worse trade),
    // but very much worth a human deciding — so it reaches the bell rather than
    // only a backend log nobody reads. Deduped per SCHEMA, not per fork, so it
    // appears once and stays until dismissed instead of once per worktree.
    if (outcome.kind !== "forked") return;
    for (const s of outcome.plan.undeclaredSchemas) {
      await recordNotification({
        type: "db",
        title: "Schema not covered by any fork exclusion",
        description: `${describeUndeclaredSchema(s)}. Declare it with ExcludeSchemaDataFromFork in the plugin that owns it.`,
        variant: "warning",
        dedupeKey: `fork-undeclared-schema:${s.schema}`,
      });
    }
  },
});
