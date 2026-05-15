import { and, asc, desc, eq, gt, inArray, lt, ne } from "drizzle-orm";
import { Rank } from "@plugins/primitives/plugins/rank/core";
import { db } from "@plugins/database/server";
import { _conversations, _attempts } from "@plugins/tasks-core/server";
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

  // First occurrence per taskId = group representative (rows sorted by rank).
  // Only count representatives ranked below (worse than) the current position.
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

// Group-aware: "before" means before the target group's representative,
// "after" means after the target group's last member.
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

  const targetTaskId = await findTaskIdForConversation(targetId, executor);

  if (zone === "before") {
    const conditions = [
      inArray(_conversations.status, LIVE_STATUSES),
      lt(_conversationsExtQueue.rank, target.rank),
    ];
    if (targetTaskId) conditions.push(ne(_attempts.taskId, targetTaskId));

    const [pred] = await executor
      .select({ rank: _conversationsExtQueue.rank })
      .from(_conversationsExtQueue)
      .innerJoin(_conversations, eq(_conversations.id, _conversationsExtQueue.parentId))
      .innerJoin(_attempts, eq(_attempts.id, _conversations.attemptId))
      .where(and(...conditions))
      .orderBy(desc(_conversationsExtQueue.rank))
      .limit(1);

    return safeBetween(
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard, no noUncheckedIndexedAccess
      pred?.rank ? Rank.from(pred.rank as string) : null,
      Rank.from(target.rank as string),
    );
  } else {
    // "after" the group = after the group's LAST member
    let lastGroupRank = target.rank;
    if (targetTaskId) {
      const [lastMember] = await executor
        .select({ rank: _conversationsExtQueue.rank })
        .from(_conversationsExtQueue)
        .innerJoin(_conversations, eq(_conversations.id, _conversationsExtQueue.parentId))
        .innerJoin(_attempts, eq(_attempts.id, _conversations.attemptId))
        .where(
          and(
            eq(_attempts.taskId, targetTaskId),
            inArray(_conversations.status, LIVE_STATUSES),
          ),
        )
        .orderBy(desc(_conversationsExtQueue.rank))
        .limit(1);
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard, no noUncheckedIndexedAccess
      if (lastMember?.rank) lastGroupRank = lastMember.rank;
    }

    const conditions = [
      inArray(_conversations.status, LIVE_STATUSES),
      gt(_conversationsExtQueue.rank, lastGroupRank),
    ];
    if (targetTaskId) conditions.push(ne(_attempts.taskId, targetTaskId));

    const [succ] = await executor
      .select({ rank: _conversationsExtQueue.rank })
      .from(_conversationsExtQueue)
      .innerJoin(_conversations, eq(_conversations.id, _conversationsExtQueue.parentId))
      .innerJoin(_attempts, eq(_attempts.id, _conversations.attemptId))
      .where(and(...conditions))
      .orderBy(asc(_conversationsExtQueue.rank))
      .limit(1);

    return safeBetween(
      Rank.from(lastGroupRank as string),
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

export async function findGroupSiblings(
  taskId: string,
  excludeId: string,
  executor: RankExecutor = db,
): Promise<Array<{ id: string; rank: Rank }>> {
  const rows = await executor
    .select({ id: _conversationsExtQueue.parentId, rank: _conversationsExtQueue.rank })
    .from(_conversationsExtQueue)
    .innerJoin(_conversations, eq(_conversations.id, _conversationsExtQueue.parentId))
    .innerJoin(_attempts, eq(_attempts.id, _conversations.attemptId))
    .where(
      and(
        eq(_attempts.taskId, taskId),
        ne(_conversationsExtQueue.parentId, excludeId),
        inArray(_conversations.status, LIVE_STATUSES),
      ),
    )
    .orderBy(asc(_conversationsExtQueue.rank));
  return rows.map((r) => ({ id: r.id, rank: Rank.from(r.rank as string) }));
}

// Moves all same-task siblings to cluster immediately after targetNewRank,
// preserving their relative order.
export async function reseatGroupMembers(
  targetId: string,
  targetNewRank: Rank,
  executor: RankExecutor,
): Promise<void> {
  const taskId = await findTaskIdForConversation(targetId, executor);
  if (!taskId) return;

  const siblings = await findGroupSiblings(taskId, targetId, executor);
  if (siblings.length === 0) return;

  // Upper bound: next non-group conversation after targetNewRank
  const [nextNonGroup] = await executor
    .select({ rank: _conversationsExtQueue.rank })
    .from(_conversationsExtQueue)
    .innerJoin(_conversations, eq(_conversations.id, _conversationsExtQueue.parentId))
    .innerJoin(_attempts, eq(_attempts.id, _conversations.attemptId))
    .where(
      and(
        inArray(_conversations.status, LIVE_STATUSES),
        ne(_attempts.taskId, taskId),
        gt(_conversationsExtQueue.rank, targetNewRank.toJSON()),
      ),
    )
    .orderBy(asc(_conversationsExtQueue.rank))
    .limit(1);

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard, no noUncheckedIndexedAccess
  const upperBound = nextNonGroup?.rank ? Rank.from(nextNonGroup.rank as string) : null;

  let prev = targetNewRank;
  for (const sib of siblings) {
    const newRank = Rank.between(prev, upperBound);
    await upsertRank(sib.id, newRank, executor);
    prev = newRank;
  }
}

// Places a conversation right after its task group's existing selected member.
// Returns null if the task has no existing ranked members.
export async function rankJoiningGroup(
  taskId: string,
  conversationId: string,
  executor: RankExecutor = db,
): Promise<Rank | null> {
  const [selected] = await executor
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
    .orderBy(asc(_conversationsExtQueue.rank))
    .limit(1);

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard, no noUncheckedIndexedAccess
  if (!selected?.rank) return null;

  const [next] = await executor
    .select({ rank: _conversationsExtQueue.rank })
    .from(_conversationsExtQueue)
    .innerJoin(_conversations, eq(_conversations.id, _conversationsExtQueue.parentId))
    .where(
      and(
        inArray(_conversations.status, LIVE_STATUSES),
        ne(_conversationsExtQueue.parentId, conversationId),
        gt(_conversationsExtQueue.rank, selected.rank),
      ),
    )
    .orderBy(asc(_conversationsExtQueue.rank))
    .limit(1);

  return safeBetween(
    Rank.from(selected.rank as string),
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard, no noUncheckedIndexedAccess
    next?.rank ? Rank.from(next.rank as string) : null,
  );
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
