import { and, asc, eq, ne, sql } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { _conversations, _attempts } from "@plugins/tasks-core/server";
import type { RankExecutor } from "@plugins/primitives/plugins/rank/server";
import { conversationsQueue, _queueState } from "./tables";

const SINGLETON = "singleton";

// Mirrors hasBlockingDep in tasks-core: true when the conversation's task has
// at least one non-dropped dependency without a completed attempt.
const notBlocked = sql`NOT EXISTS (
  SELECT 1 FROM task_dependencies td
    JOIN tasks dep ON dep.id = td.depends_on_task_id
   WHERE td.task_id = ${_attempts.taskId}
     AND dep.dropped_at IS NULL
     AND NOT EXISTS (
       SELECT 1 FROM attempts a
        WHERE a.task_id = dep.id AND a.status = 'completed'
     )
)`;

export async function getPinnedId(executor: RankExecutor = db): Promise<string | null> {
  const [row] = await executor
    .select({ pinnedConversationId: _queueState.pinnedConversationId })
    .from(_queueState)
    .where(eq(_queueState.id, SINGLETON))
    .limit(1);
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard, no noUncheckedIndexedAccess
  return row?.pinnedConversationId ?? null;
}

export async function setPinnedId(id: string | null, executor: RankExecutor = db): Promise<void> {
  const now = new Date();
  await executor
    .insert(_queueState)
    .values({ id: SINGLETON, pinnedConversationId: id, updatedAt: now })
    .onConflictDoUpdate({
      target: _queueState.id,
      set: { pinnedConversationId: id, updatedAt: now },
    });
}

export async function topWaitingByRank(
  excludeId?: string,
  executor: RankExecutor = db,
): Promise<string | null> {
  const conditions = [eq(_conversations.status, "waiting" as const), notBlocked];
  if (excludeId) {
    conditions.push(ne(conversationsQueue.table.parentId, excludeId));
  }
  const [row] = await executor
    .select({ id: conversationsQueue.table.parentId })
    .from(conversationsQueue.table)
    .innerJoin(_conversations, eq(_conversations.id, conversationsQueue.table.parentId))
    .innerJoin(_attempts, eq(_attempts.id, _conversations.attemptId))
    .where(and(...conditions))
    .orderBy(asc(conversationsQueue.table.rank))
    .limit(1);
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard, no noUncheckedIndexedAccess
  return row?.id ?? null;
}

export async function validatePin(executor: RankExecutor = db): Promise<string | null> {
  const pinnedId = await getPinnedId(executor);
  if (pinnedId) {
    const [valid] = await executor
      .select({ id: conversationsQueue.table.parentId })
      .from(conversationsQueue.table)
      .innerJoin(_conversations, eq(_conversations.id, conversationsQueue.table.parentId))
      .innerJoin(_attempts, eq(_attempts.id, _conversations.attemptId))
      .where(
        and(
          eq(conversationsQueue.table.parentId, pinnedId),
          eq(_conversations.status, "waiting" as const),
          notBlocked,
        ),
      )
      .limit(1);
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard, no noUncheckedIndexedAccess
    if (valid) return pinnedId;
  }
  const nextId = await topWaitingByRank(undefined, executor);
  await setPinnedId(nextId, executor);
  return nextId;
}
