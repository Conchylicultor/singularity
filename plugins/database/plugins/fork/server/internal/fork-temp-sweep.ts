import { z } from "zod";
import { defineJob } from "@plugins/infra/plugins/jobs/server";
import {
  listDatabases,
  dropDatabase,
  countActiveConnections,
} from "@plugins/database/plugins/admin/server";

const TEMP_SUFFIX = "__forking";

// Reaps orphaned `<target>__forking` temp DBs. Most are reaped by the next fork
// for that target (forkDatabase drops a stale temp first); the lingering case
// is a temp whose fork job went `dead` and never retries. Runs every 15 min on
// the main runtime only (no perWorktree) — DBs are a global cluster resource,
// so a single sweep covers all worktrees.
export const forkTempSweepJob = defineJob({
  name: "database.fork-temp-sweep",
  input: z.object({}),
  event: z.never(),
  dedup: "singleton",
  schedule: { cron: "*/15 * * * *" },
  async run() {
    const temps = (await listDatabases()).filter((d) => d.endsWith(TEMP_SUFFIX));
    for (const temp of temps) {
      // A live fork's pg_restore holds a connection to the temp — protect it.
      // Only drop temps with zero active connections.
      if ((await countActiveConnections(temp)) === 0) {
        await dropDatabase(temp);
      }
    }
  },
});
