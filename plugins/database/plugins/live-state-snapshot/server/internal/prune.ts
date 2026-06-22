import { z } from "zod";
import { sql as drizzleSql } from "drizzle-orm";
import { defineJob } from "@plugins/infra/plugins/jobs/server";
import { db } from "@plugins/database/server";
import {
  LIVE_STATE_CHANGELOG_TABLE,
  LIVE_STATE_SNAPSHOT_TABLE,
} from "@plugins/database/plugins/change-feed/server";

// Hard time-ceiling on retained changelog history. Beyond this, a row is pruned
// even if a stale snapshot floor would otherwise pin it — bounding the table even
// when a resource hasn't re-persisted in a long time. A server down longer than
// this falls to the FULL backstop in catch-up (bounded and correct).
const RETENTION = "24 hours";

// Prunes the durable changelog. The safe lower bound is `xid < min(position)`:
// every persisted snapshot already incorporates every row strictly older than its
// own watermark, so a row below the GLOBAL floor can never be needed by catch-up.
// COALESCE(min(position), 0) keeps the prune correct when no snapshot exists yet
// (floor 0 ⇒ only the time-ceiling clause prunes). The `at < now() - RETENTION`
// clause is the independent hard ceiling. Runs per-worktree because each worktree
// DB fork has its own changelog + snapshot tables. See
// research/2026-06-22-global-live-state-l2-persisted-materialization.md §3.7.
export const liveStateChangelogPruneJob = defineJob({
  name: "database.live-state-changelog-prune",
  input: z.object({}),
  event: z.never(),
  dedup: "singleton",
  schedule: { cron: "0 * * * *", perWorktree: true },
  maxAttempts: 3,
  async run() {
    await db.execute(
      drizzleSql.raw(
        `DELETE FROM ${LIVE_STATE_CHANGELOG_TABLE}
         WHERE xid < (SELECT COALESCE(min(position), 0) FROM ${LIVE_STATE_SNAPSHOT_TABLE})
            OR at < now() - interval '${RETENTION}'`,
      ),
    );
  },
});
