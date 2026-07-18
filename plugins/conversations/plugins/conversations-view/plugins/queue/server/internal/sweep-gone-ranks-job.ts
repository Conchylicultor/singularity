import { z } from "zod";
import { and, eq, inArray, lt } from "drizzle-orm";
import { defineJob } from "@plugins/infra/plugins/jobs/server";
import { isMain } from "@plugins/infra/plugins/paths/server";
import { db } from "@plugins/database/server";
import { _conversations } from "@plugins/tasks/plugins/tasks-core/server";
import { conversationsQueue } from "./tables";

const DAY_MS = 24 * 60 * 60 * 1000;
const GONE_RANK_TTL_DAYS = 30;

// Retention sweep for `conversations_ext_queue`: a rank is launch-time-seeded and
// meaningless once its conversation has left the queue for good. FK CASCADE
// already reclaims a rank when its conversation is hard-deleted; this reclaims the
// rows whose conversation is soft-gone (status `gone`) and has been so past the
// TTL, so the queue table can't accumulate dead ranks indefinitely.
//
// Why NOT `defineRetention`: its sweep is a single-table `DELETE WHERE <column> <
// cutoff` and `conversations_ext_queue` has no timestamp/status column of its own
// (it's a 1:1 side-table carrying only `rank`). "Gone past 30 days" requires
// joining to `_conversations` for the status + `endedAt` timestamp, which the
// single-table TTL-column shape cannot express — so we follow retention's nightly
// cadence with a plain scheduled `defineJob`.
//
// No resource impact: point membership never reads a gone conversation (it left
// the live set), so deleting its rank routes a change-feed delete only to tuples
// containing that id — structurally none. Main-only (`isMain()`), like
// `hibernateIdleJob`: only main owns the canonical conversation rows.
export const sweepGoneRanksJob = defineJob({
  name: "queue.sweep-gone-ranks",
  input: z.object({}),
  event: z.never(),
  dedup: "singleton",
  schedule: { cron: "0 4 * * *" },
  async run() {
    if (!isMain()) return;
    const cutoff = new Date(Date.now() - GONE_RANK_TTL_DAYS * DAY_MS);
    const goneIds = db
      .select({ id: _conversations.id })
      .from(_conversations)
      .where(and(eq(_conversations.status, "gone" as const), lt(_conversations.endedAt, cutoff)));
    await db
      .delete(conversationsQueue.table)
      .where(inArray(conversationsQueue.table.parentId, goneIds));
  },
});
