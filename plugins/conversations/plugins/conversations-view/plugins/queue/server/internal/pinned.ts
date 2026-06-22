import { and, asc, eq, ne, sql } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { _conversations, _attempts } from "@plugins/tasks/plugins/tasks-core/server";
import type { RankExecutor } from "@plugins/primitives/plugins/rank/server";
import { conversationsQueue, _queueState } from "./tables";

const SINGLETON = "singleton";

// True when the conversation's task has no active (transitive) blocking
// dependency. Reads the shared `task_blocking_v` view (the SQL embodiment of
// isSettled/activeBlockers) instead of re-deriving the predicate here — the old
// hand-written copy was single-hop and so couldn't punch through a *dropped*
// intermediate to see a deeper unresolved blocker. A task with no row in the
// view has no dependencies → not blocked.
const notBlocked = sql`NOT COALESCE((
  SELECT b.has_blocking_dep FROM task_blocking_v b WHERE b.task_id = ${_attempts.taskId}
), false)`;

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
