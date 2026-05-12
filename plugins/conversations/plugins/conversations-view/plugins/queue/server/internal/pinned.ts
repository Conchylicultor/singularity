import { and, asc, eq, ne } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { _conversations } from "@plugins/tasks-core/server";
import type { RankExecutor } from "@plugins/primitives/plugins/rank/server";
import { conversationsQueue, _queueState } from "./tables";

const SINGLETON = "singleton";

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
  const conditions = [eq(_conversations.status, "waiting" as const)];
  if (excludeId) {
    conditions.push(ne(conversationsQueue.table.parentId, excludeId));
  }
  const [row] = await executor
    .select({ id: conversationsQueue.table.parentId })
    .from(conversationsQueue.table)
    .innerJoin(_conversations, eq(_conversations.id, conversationsQueue.table.parentId))
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
      .where(
        and(
          eq(conversationsQueue.table.parentId, pinnedId),
          eq(_conversations.status, "waiting" as const),
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
