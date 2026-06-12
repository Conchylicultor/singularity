import { and, asc, eq, ne, sql } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { _conversations, _attempts } from "@plugins/tasks/plugins/tasks-core/server";
import type { RankExecutor } from "@plugins/primitives/plugins/rank/server";
import { conversationsQueue, _queueState } from "./tables";

const SINGLETON = "singleton";

// True when the conversation's task has no non-dropped dependency without a completed attempt.
const notBlocked = sql`NOT EXISTS (
  SELECT 1 FROM task_dependencies td
    JOIN tasks dep ON dep.id = td.depends_on_task_id
   WHERE td.task_id = ${_attempts.taskId}
     AND dep.dropped_at IS NULL
     AND NOT EXISTS (
       SELECT 1 FROM attempts_v a
        WHERE a.task_id = dep.id AND a.status = 'completed'
     )
)`;

// True when no other live member of the same task was created more recently.
const isGroupSelected = sql`NOT EXISTS (
  SELECT 1 FROM conversations_ext_queue eq2
    JOIN conversations c2 ON c2.id = eq2.parent_id
    JOIN attempts a2 ON a2.id = c2.attempt_id
   WHERE a2.task_id = ${_attempts.taskId}
     AND eq2.parent_id != ${conversationsQueue.table.parentId}
     AND c2.status IN ('waiting', 'working', 'starting')
     AND c2.created_at > (SELECT created_at FROM conversations WHERE id = ${conversationsQueue.table.parentId})
)`;

// True when no sibling in the same task group is currently working/starting.
// A group with an active worker doesn't need user focus — the pin should advance.
const noGroupMemberWorking = sql`NOT EXISTS (
  SELECT 1 FROM conversations_ext_queue eq3
    JOIN conversations c3 ON c3.id = eq3.parent_id
    JOIN attempts a3 ON a3.id = c3.attempt_id
   WHERE a3.task_id = ${_attempts.taskId}
     AND c3.status IN ('working', 'starting')
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
  excludeTaskId?: string,
  executor: RankExecutor = db,
): Promise<string | null> {
  const conditions = [
    eq(_conversations.status, "waiting" as const),
    notBlocked,
    isGroupSelected,
    noGroupMemberWorking,
  ];
  if (excludeId) {
    conditions.push(ne(conversationsQueue.table.parentId, excludeId));
  }
  if (excludeTaskId) {
    conditions.push(ne(_attempts.taskId, excludeTaskId));
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
          isGroupSelected,
          noGroupMemberWorking,
        ),
      )
      .limit(1);
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard, no noUncheckedIndexedAccess
    if (valid) return pinnedId;
  }
  const nextId = await topWaitingByRank(undefined, undefined, executor);
  await setPinnedId(nextId, executor);
  return nextId;
}
