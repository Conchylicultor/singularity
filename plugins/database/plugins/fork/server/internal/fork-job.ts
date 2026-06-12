import { z } from "zod";
import { defineJob } from "@plugins/infra/plugins/jobs/server";
import { recordNotification } from "@plugins/shell/plugins/notifications/server";
import { forkDatabase } from "@plugins/database/plugins/admin/server";

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
  input: z.object({ source: z.string(), target: z.string() }),
  // Direct-enqueue only (kicked off when a conversation/worktree is created).
  event: z.never(),
  // jobKey "database.fork:<target>" — replace-if-not-running per target.
  dedup: { key: (input) => input.target },
  maxAttempts: 5,
  run: async ({ input: { source, target } }) => {
    try {
      await forkDatabase(source, target);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await recordNotification({
        type: "db",
        title: "DB fork failed",
        description: `${target}: ${message}`,
        variant: "error",
        dedupeKey: `fork-error:${target}`,
      });
      // Rethrow so graphile retries (and eventually marks the job dead once
      // maxAttempts is exhausted — observable at /api/jobs).
      throw err;
    }
  },
});
