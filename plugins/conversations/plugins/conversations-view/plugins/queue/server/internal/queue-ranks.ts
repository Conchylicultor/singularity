import { and, asc, desc, eq, gt, inArray, lt, ne, type SQL } from "drizzle-orm";
import { Rank } from "@plugins/primitives/plugins/rank/core";
import { db } from "@plugins/database/server";
import { _conversations, _attempts } from "@plugins/tasks-core/server";
import type { RankExecutor } from "@plugins/primitives/plugins/rank/server";
import type { ConversationStatus } from "@plugins/conversations/core";
import { conversationsQueue } from "./tables";

const _conversationsExtQueue = conversationsQueue.table;

const LIVE_STATUSES: ConversationStatus[] = ["waiting", "working", "starting"];

// All "deck" reads join the queue ext-table with `_conversations` and filter
// to live-process statuses (waiting, working, starting). The queue is the
// single global ordered list; non-live rows may have an ext entry but never
// participate in deck math.

function joinedWaiting(executor: RankExecutor = db) {
  return executor
    .select({ rank: _conversationsExtQueue.rank, id: _conversationsExtQueue.parentId })
    .from(_conversationsExtQueue)
    .innerJoin(_conversations, eq(_conversations.id, _conversationsExtQueue.parentId));
}

// Defense-in-depth: when prev and next are equal (shouldn't happen with
// FOR UPDATE serialization, but guard against any remaining edge case),
// treat as "append after prev" instead of crashing.
function safeBetween(prev: Rank | null, next: Rank | null): Rank {
  if (prev && next && Rank.equals(prev, next)) {
    return Rank.between(prev, null);
  }
  return Rank.between(prev, next);
}

// End of deck: greater than every currently-waiting rank.
export async function endRank(): Promise<Rank> {
  const [last] = await joinedWaiting()
    .where(eq(_conversations.status, "waiting"))
    .orderBy(desc(_conversationsExtQueue.rank))
    .limit(1);
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard, no noUncheckedIndexedAccess
  return Rank.between(last?.rank ? Rank.from(last.rank as string) : null, null);
}

// Position 2 of the deck: between the current top and second-place ranks.
// 0 live → returns any rank (becomes the only item).
// 1 live → returns a rank after that single item.
// `excludeId` keeps the conversation being ranked out of the deck query.
// Uses LIVE_STATUSES (not just "waiting") so the position-1 conversation
// is always visible as the anchor, even when it's "working" or "starting".
// When `executor` is a transaction, the caller MUST have acquired the lock
// (via `lockDeck`) so concurrent seeders serialize on the same rows.
export async function positionTwoRank(
  excludeId?: string,
  executor: RankExecutor = db,
): Promise<Rank> {
  const where: SQL[] = [inArray(_conversations.status, LIVE_STATUSES)];
  if (excludeId) where.push(ne(_conversationsExtQueue.parentId, excludeId));
  const top2 = await joinedWaiting(executor)
    .where(and(...where))
    .orderBy(asc(_conversationsExtQueue.rank))
    .limit(2);
  const top = top2[0]?.rank ? Rank.from(top2[0].rank as string) : null;
  const second = top2[1]?.rank ? Rank.from(top2[1].rank as string) : null;
  return safeBetween(top, second);
}

// Acquire a FOR UPDATE lock on the ext-queue rows that participate in deck
// math. Call once at the start of a transaction before any rank reads —
// concurrent transactions block here until the lock holder commits.
export async function lockDeck(executor: RankExecutor): Promise<void> {
  await executor
    .select({ id: _conversationsExtQueue.parentId })
    .from(_conversationsExtQueue)
    .innerJoin(_conversations, eq(_conversations.id, _conversationsExtQueue.parentId))
    .where(inArray(_conversations.status, LIVE_STATUSES))
    .for("update", { of: _conversationsExtQueue });
}

// Returns true when `conversationId` currently holds the top rank among all
// live conversations in the deck. Used by seedRankJob to avoid demoting the
// position-1 item on turn completion.
export async function isTopOfDeck(
  conversationId: string,
  executor: RankExecutor = db,
): Promise<boolean> {
  const [top] = await joinedWaiting(executor)
    .where(inArray(_conversations.status, LIVE_STATUSES))
    .orderBy(asc(_conversationsExtQueue.rank))
    .limit(1);
  return top?.id === conversationId;
}

// Rank that places a conversation before all currently-waiting conversations.
export async function rankForTop(excludeId: string): Promise<Rank> {
  const [first] = await joinedWaiting()
    .where(
      and(
        eq(_conversations.status, "waiting"),
        ne(_conversationsExtQueue.parentId, excludeId),
      ),
    )
    .orderBy(asc(_conversationsExtQueue.rank))
    .limit(1);
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard, no noUncheckedIndexedAccess
  return Rank.between(null, first?.rank ? Rank.from(first.rank as string) : null);
}

// Rank that places a conversation after all currently-waiting conversations.
export async function rankForBottom(excludeId: string): Promise<Rank> {
  const [last] = await joinedWaiting()
    .where(
      and(
        eq(_conversations.status, "waiting"),
        ne(_conversationsExtQueue.parentId, excludeId),
      ),
    )
    .orderBy(desc(_conversationsExtQueue.rank))
    .limit(1);
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard, no noUncheckedIndexedAccess
  return Rank.between(last?.rank ? Rank.from(last.rank as string) : null, null);
}

// Rank that moves a conversation n positions down in the deck. Falls back to
// rankForBottom when fewer than n items exist below the current position.
export async function rankAfterN(conversationId: string, n: number): Promise<Rank> {
  const [self] = await db
    .select({ rank: _conversationsExtQueue.rank })
    .from(_conversationsExtQueue)
    .where(eq(_conversationsExtQueue.parentId, conversationId))
    .limit(1);
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard, no noUncheckedIndexedAccess
  if (!self?.rank) return rankForBottom(conversationId);

  const rows = await joinedWaiting()
    .where(
      and(
        eq(_conversations.status, "waiting"),
        ne(_conversationsExtQueue.parentId, conversationId),
        gt(_conversationsExtQueue.rank, self.rank),
      ),
    )
    .orderBy(asc(_conversationsExtQueue.rank))
    .limit(n + 1);

  if (rows.length < n) return rankForBottom(conversationId);
  return Rank.between(
    Rank.from(rows[n - 1].rank as string),
    rows[n]?.rank ? Rank.from(rows[n].rank as string) : null,
  );
}

// Rank that slots a conversation immediately before or after targetId in the
// ordered deck. Looks up targetId's current rank, then finds its neighbour in
// the given direction to compute the midpoint rank.
export async function rankAdjacentTo(
  targetId: string,
  zone: "before" | "after",
): Promise<Rank> {
  const [target] = await db
    .select({ rank: _conversationsExtQueue.rank })
    .from(_conversationsExtQueue)
    .where(eq(_conversationsExtQueue.parentId, targetId))
    .limit(1);
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard, no noUncheckedIndexedAccess
  if (!target?.rank) throw new Error(`No queue rank for conversation ${targetId}`);

  if (zone === "before") {
    const [pred] = await joinedWaiting()
      .where(
        and(
          eq(_conversations.status, "waiting"),
          lt(_conversationsExtQueue.rank, target.rank),
        ),
      )
      .orderBy(desc(_conversationsExtQueue.rank))
      .limit(1);
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard, no noUncheckedIndexedAccess
    return safeBetween(pred?.rank ? Rank.from(pred.rank as string) : null, Rank.from(target.rank as string));
  } else {
    const [succ] = await joinedWaiting()
      .where(
        and(
          eq(_conversations.status, "waiting"),
          gt(_conversationsExtQueue.rank, target.rank),
        ),
      )
      .orderBy(asc(_conversationsExtQueue.rank))
      .limit(1);
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard, no noUncheckedIndexedAccess
    return safeBetween(Rank.from(target.rank as string), succ?.rank ? Rank.from(succ.rank as string) : null);
  }
}

export async function rankAfterBlockers(
  conversationId: string,
  blockingTaskIds: string[],
  executor: RankExecutor = db,
): Promise<Rank> {
  if (blockingTaskIds.length === 0) return positionTwoRank(conversationId, executor);

  const [last] = await executor
    .select({ rank: _conversationsExtQueue.rank })
    .from(_conversationsExtQueue)
    .innerJoin(_conversations, eq(_conversations.id, _conversationsExtQueue.parentId))
    .innerJoin(_attempts, eq(_attempts.id, _conversations.attemptId))
    .where(
      and(
        eq(_conversations.status, "waiting"),
        ne(_conversationsExtQueue.parentId, conversationId),
        inArray(_attempts.taskId, blockingTaskIds),
      ),
    )
    .orderBy(desc(_conversationsExtQueue.rank))
    .limit(1);

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard, no noUncheckedIndexedAccess
  if (!last?.rank) return positionTwoRank(conversationId, executor);

  const [succ] = await joinedWaiting(executor)
    .where(
      and(
        eq(_conversations.status, "waiting"),
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
