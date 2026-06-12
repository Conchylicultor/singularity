import { and, asc, desc, eq, gt, inArray, lt, ne } from "drizzle-orm";
import { Rank } from "@plugins/primitives/plugins/rank/core";
import { db } from "@plugins/database/server";
import { _conversations, _attempts } from "@plugins/tasks/plugins/tasks-core/server";
import type { RankExecutor } from "@plugins/primitives/plugins/rank/server";
import type { ConversationStatus } from "@plugins/conversations/core";
import { conversationsQueue } from "./tables";

const _conversationsExtQueue = conversationsQueue.table;

const LIVE_STATUSES: ConversationStatus[] = ["waiting", "working", "starting"];

function joinedLive(executor: RankExecutor = db) {
  return executor
    .select({ rank: _conversationsExtQueue.rank, id: _conversationsExtQueue.parentId })
    .from(_conversationsExtQueue)
    .innerJoin(_conversations, eq(_conversations.id, _conversationsExtQueue.parentId));
}

function safeBetween(prev: Rank | null, next: Rank | null): Rank {
  if (prev && next && Rank.equals(prev, next)) {
    return Rank.between(prev, null);
  }
  return Rank.between(prev, next);
}

export async function endRank(): Promise<Rank> {
  const [last] = await joinedLive()
    .where(inArray(_conversations.status, LIVE_STATUSES))
    .orderBy(desc(_conversationsExtQueue.rank))
    .limit(1);
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard, no noUncheckedIndexedAccess
  return Rank.between(last?.rank ? Rank.from(last.rank as string) : null, null);
}

export async function lockDeck(executor: RankExecutor): Promise<void> {
  await executor
    .select({ id: _conversationsExtQueue.parentId })
    .from(_conversationsExtQueue)
    .innerJoin(_conversations, eq(_conversations.id, _conversationsExtQueue.parentId))
    .where(inArray(_conversations.status, LIVE_STATUSES))
    .for("update", { of: _conversationsExtQueue });
}

export async function rankForTop(excludeId: string, executor: RankExecutor = db): Promise<Rank> {
  const [first] = await joinedLive(executor)
    .where(
      and(
        inArray(_conversations.status, LIVE_STATUSES),
        ne(_conversationsExtQueue.parentId, excludeId),
      ),
    )
    .orderBy(asc(_conversationsExtQueue.rank))
    .limit(1);
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard, no noUncheckedIndexedAccess
  return Rank.between(null, first?.rank ? Rank.from(first.rank as string) : null);
}

export async function rankForBottom(excludeId: string, executor: RankExecutor = db): Promise<Rank> {
  const [last] = await joinedLive(executor)
    .where(
      and(
        inArray(_conversations.status, LIVE_STATUSES),
        ne(_conversationsExtQueue.parentId, excludeId),
      ),
    )
    .orderBy(desc(_conversationsExtQueue.rank))
    .limit(1);
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard, no noUncheckedIndexedAccess
  return Rank.between(last?.rank ? Rank.from(last.rank as string) : null, null);
}

// Skips N distinct task groups below the current position.
export async function rankAfterN(conversationId: string, n: number, executor: RankExecutor = db): Promise<Rank> {
  const [self] = await executor
    .select({ rank: _conversationsExtQueue.rank })
    .from(_conversationsExtQueue)
    .where(eq(_conversationsExtQueue.parentId, conversationId))
    .limit(1);
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard, no noUncheckedIndexedAccess
  if (!self?.rank) return rankForBottom(conversationId, executor);

  const taskId = await findTaskIdForConversation(conversationId, executor);
  const selfRank = Rank.from(self.rank as string);

  const conditions = [
    inArray(_conversations.status, LIVE_STATUSES),
    ne(_conversationsExtQueue.parentId, conversationId),
  ];
  if (taskId) conditions.push(ne(_attempts.taskId, taskId));

  const rows = await executor
    .select({
      rank: _conversationsExtQueue.rank,
      taskId: _attempts.taskId,
    })
    .from(_conversationsExtQueue)
    .innerJoin(_conversations, eq(_conversations.id, _conversationsExtQueue.parentId))
    .innerJoin(_attempts, eq(_attempts.id, _conversations.attemptId))
    .where(and(...conditions))
    .orderBy(asc(_conversationsExtQueue.rank));

  // Deduplicate by taskId — each group counts once regardless of member count.
  const seen = new Set<string>();
  const repsBelow: Rank[] = [];
  for (const row of rows) {
    if (seen.has(row.taskId)) continue;
    seen.add(row.taskId);
    const r = Rank.from(row.rank as string);
    if (Rank.compare(r, selfRank) > 0) {
      repsBelow.push(r);
    }
  }

  if (repsBelow.length < n) return rankForBottom(conversationId, executor);

  return Rank.between(
    repsBelow[n - 1]!,
    repsBelow[n] ?? null,
  );
}

// Insert before or after the target group's shared rank.
export async function rankAdjacentTo(
  targetId: string,
  zone: "before" | "after",
  executor: RankExecutor = db,
): Promise<Rank> {
  const [target] = await executor
    .select({ rank: _conversationsExtQueue.rank })
    .from(_conversationsExtQueue)
    .where(eq(_conversationsExtQueue.parentId, targetId))
    .limit(1);
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard, no noUncheckedIndexedAccess
  if (!target?.rank) throw new Error(`No queue rank for conversation ${targetId}`);

  if (zone === "before") {
    const [pred] = await executor
      .select({ rank: _conversationsExtQueue.rank })
      .from(_conversationsExtQueue)
      .innerJoin(_conversations, eq(_conversations.id, _conversationsExtQueue.parentId))
      .where(
        and(
          inArray(_conversations.status, LIVE_STATUSES),
          lt(_conversationsExtQueue.rank, target.rank),
        ),
      )
      .orderBy(desc(_conversationsExtQueue.rank))
      .limit(1);

    return safeBetween(
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard, no noUncheckedIndexedAccess
      pred?.rank ? Rank.from(pred.rank as string) : null,
      Rank.from(target.rank as string),
    );
  } else {
    const [succ] = await executor
      .select({ rank: _conversationsExtQueue.rank })
      .from(_conversationsExtQueue)
      .innerJoin(_conversations, eq(_conversations.id, _conversationsExtQueue.parentId))
      .where(
        and(
          inArray(_conversations.status, LIVE_STATUSES),
          gt(_conversationsExtQueue.rank, target.rank),
        ),
      )
      .orderBy(asc(_conversationsExtQueue.rank))
      .limit(1);

    return safeBetween(
      Rank.from(target.rank as string),
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard, no noUncheckedIndexedAccess
      succ?.rank ? Rank.from(succ.rank as string) : null,
    );
  }
}

export async function rankAfterBlockers(
  conversationId: string,
  blockingTaskIds: string[],
  executor: RankExecutor = db,
): Promise<Rank> {
  if (blockingTaskIds.length === 0) return rankForTop(conversationId, executor);

  const [last] = await executor
    .select({ rank: _conversationsExtQueue.rank })
    .from(_conversationsExtQueue)
    .innerJoin(_conversations, eq(_conversations.id, _conversationsExtQueue.parentId))
    .innerJoin(_attempts, eq(_attempts.id, _conversations.attemptId))
    .where(
      and(
        inArray(_conversations.status, LIVE_STATUSES),
        ne(_conversationsExtQueue.parentId, conversationId),
        inArray(_attempts.taskId, blockingTaskIds),
      ),
    )
    .orderBy(desc(_conversationsExtQueue.rank))
    .limit(1);

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard, no noUncheckedIndexedAccess
  if (!last?.rank) return rankForTop(conversationId, executor);

  const [succ] = await joinedLive(executor)
    .where(
      and(
        inArray(_conversations.status, LIVE_STATUSES),
        ne(_conversationsExtQueue.parentId, conversationId),
        gt(_conversationsExtQueue.rank, last.rank),
      ),
    )
    .orderBy(asc(_conversationsExtQueue.rank))
    .limit(1);

  return safeBetween(
    Rank.from(last.rank as string),
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard, no noUncheckedIndexedAccess
    succ?.rank ? Rank.from(succ.rank as string) : null,
  );
}

// --- Task group helpers ---

export async function findTaskIdForConversation(
  conversationId: string,
  executor: RankExecutor = db,
): Promise<string | null> {
  const [row] = await executor
    .select({ taskId: _attempts.taskId })
    .from(_conversations)
    .innerJoin(_attempts, eq(_attempts.id, _conversations.attemptId))
    .where(eq(_conversations.id, conversationId))
    .limit(1);
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard, no noUncheckedIndexedAccess
  return row?.taskId ?? null;
}

async function findGroupSiblingIds(
  taskId: string,
  excludeId: string,
  executor: RankExecutor = db,
): Promise<string[]> {
  const rows = await executor
    .select({ id: _conversationsExtQueue.parentId })
    .from(_conversationsExtQueue)
    .innerJoin(_conversations, eq(_conversations.id, _conversationsExtQueue.parentId))
    .innerJoin(_attempts, eq(_attempts.id, _conversations.attemptId))
    .where(
      and(
        eq(_attempts.taskId, taskId),
        ne(_conversationsExtQueue.parentId, excludeId),
        inArray(_conversations.status, LIVE_STATUSES),
      ),
    );
  return rows.map((r) => r.id);
}

// Sets all same-task siblings to the same rank as the moved conversation.
export async function reseatGroupMembers(
  targetId: string,
  targetNewRank: Rank,
  executor: RankExecutor,
): Promise<void> {
  const taskId = await findTaskIdForConversation(targetId, executor);
  if (!taskId) return;

  const siblingIds = await findGroupSiblingIds(taskId, targetId, executor);
  for (const id of siblingIds) {
    await upsertRank(id, targetNewRank, executor);
  }
}

// Returns the shared rank of the task group so the new conversation joins at
// the same position. Returns null if the task has no existing ranked members.
export async function rankJoiningGroup(
  taskId: string,
  conversationId: string,
  executor: RankExecutor = db,
): Promise<Rank | null> {
  const [existing] = await executor
    .select({ rank: _conversationsExtQueue.rank })
    .from(_conversationsExtQueue)
    .innerJoin(_conversations, eq(_conversations.id, _conversationsExtQueue.parentId))
    .innerJoin(_attempts, eq(_attempts.id, _conversations.attemptId))
    .where(
      and(
        eq(_attempts.taskId, taskId),
        ne(_conversationsExtQueue.parentId, conversationId),
        inArray(_conversations.status, LIVE_STATUSES),
      ),
    )
    .limit(1);

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard, no noUncheckedIndexedAccess
  if (!existing?.rank) return null;
  return Rank.from(existing.rank as string);
}

export async function upsertRank(
  conversationId: string,
  rank: Rank,
  executor: RankExecutor = db,
): Promise<void> {
  const now = new Date();
  await executor
    .insert(_conversationsExtQueue)
    .values({ parentId: conversationId, rank: rank.toJSON(), updatedAt: now })
    .onConflictDoUpdate({
      target: _conversationsExtQueue.parentId,
      set: { rank: rank.toJSON(), updatedAt: now },
    });
}
