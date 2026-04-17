import { and, isNull, ne, sql } from "drizzle-orm";
import { db } from "../../../../server/src/db/client";
import { _attempts, _tasks } from "../schema_internal";
import { nextRankUnder } from "./rank";
import { tasksResource } from "./resources";

export const CONVERSATIONS_META_TASK_ID = "task-meta-conversations";
const TITLE = "Conversations";

// Idempotent. Returns true iff this call inserted the row (used as the
// one-shot signal for the backfill).
export async function ensureConversationsMetaTask(): Promise<boolean> {
  const rank = await nextRankUnder(null);
  const rows = await db
    .insert(_tasks)
    .values({ id: CONVERSATIONS_META_TASK_ID, title: TITLE, rank })
    .onConflictDoNothing({ target: _tasks.id })
    .returning({ id: _tasks.id });
  return rows.length === 1;
}

// Re-parent orphan roots that have >=1 attempt under the meta task. Gated
// by ensureConversationsMetaTask()'s "just created" signal so this runs
// exactly once per database.
export async function backfillConversationsMetaParent(): Promise<number> {
  const rows = await db
    .update(_tasks)
    .set({ parentId: CONVERSATIONS_META_TASK_ID })
    .where(
      and(
        isNull(_tasks.parentId),
        ne(_tasks.id, CONVERSATIONS_META_TASK_ID),
        sql`EXISTS (SELECT 1 FROM ${_attempts} a WHERE a.task_id = ${_tasks.id})`,
      ),
    )
    .returning({ id: _tasks.id });
  if (rows.length > 0) tasksResource.notify();
  return rows.length;
}
