import { and, asc, desc, eq, gt, lt, ne } from "drizzle-orm";
import { generateKeyBetween } from "fractional-indexing";
import { db } from "@server/db/client";
import { _conversations } from "@plugins/tasks-core/server";
import { conversationsQueue } from "./tables";

const _conversationsExtQueue = conversationsQueue.table;

// All "deck" reads join the queue ext-table with `_conversations` and filter
// to `status = "waiting"`. The queue is the single global ordered list of
// waiting conversations; non-waiting rows may have an ext entry but never
// participate in deck math.

function joinedWaiting() {
  return db
    .select({ rank: _conversationsExtQueue.rank, id: _conversationsExtQueue.parentId })
    .from(_conversationsExtQueue)
    .innerJoin(_conversations, eq(_conversations.id, _conversationsExtQueue.parentId));
}

// End of deck: greater than every currently-waiting rank.
export async function endRank(): Promise<string> {
  const [last] = await joinedWaiting()
    .where(eq(_conversations.status, "waiting"))
    .orderBy(desc(_conversationsExtQueue.rank))
    .limit(1);
  return generateKeyBetween(last?.rank ?? null, null);
}

// Position 2 of the deck: between the current top and second-place ranks.
// 0 waiting → returns any rank (becomes the only item).
// 1 waiting → returns a rank after that single item.
export async function positionTwoRank(): Promise<string> {
  const top2 = await joinedWaiting()
    .where(eq(_conversations.status, "waiting"))
    .orderBy(asc(_conversationsExtQueue.rank))
    .limit(2);
  const top = top2[0]?.rank ?? null;
  const second = top2[1]?.rank ?? null;
  return generateKeyBetween(top, second);
}

// Rank that places a conversation before all currently-waiting conversations.
export async function rankForTop(excludeId: string): Promise<string> {
  const [first] = await joinedWaiting()
    .where(
      and(
        eq(_conversations.status, "waiting"),
        ne(_conversationsExtQueue.parentId, excludeId),
      ),
    )
    .orderBy(asc(_conversationsExtQueue.rank))
    .limit(1);
  return generateKeyBetween(null, first?.rank ?? null);
}

// Rank that places a conversation after all currently-waiting conversations.
export async function rankForBottom(excludeId: string): Promise<string> {
  const [last] = await joinedWaiting()
    .where(
      and(
        eq(_conversations.status, "waiting"),
        ne(_conversationsExtQueue.parentId, excludeId),
      ),
    )
    .orderBy(desc(_conversationsExtQueue.rank))
    .limit(1);
  return generateKeyBetween(last?.rank ?? null, null);
}

// Rank that moves a conversation n positions down in the deck. Falls back to
// rankForBottom when fewer than n items exist below the current position.
export async function rankAfterN(conversationId: string, n: number): Promise<string> {
  const [self] = await db
    .select({ rank: _conversationsExtQueue.rank })
    .from(_conversationsExtQueue)
    .where(eq(_conversationsExtQueue.parentId, conversationId))
    .limit(1);
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
  return generateKeyBetween(rows[n - 1].rank, rows[n]?.rank ?? null);
}

// Rank that slots a conversation immediately before or after targetId in the
// ordered deck. Looks up targetId's current rank, then finds its neighbour in
// the given direction to compute the midpoint rank.
export async function rankAdjacentTo(
  targetId: string,
  zone: "before" | "after",
): Promise<string> {
  const [target] = await db
    .select({ rank: _conversationsExtQueue.rank })
    .from(_conversationsExtQueue)
    .where(eq(_conversationsExtQueue.parentId, targetId))
    .limit(1);
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
    return generateKeyBetween(pred?.rank ?? null, target.rank);
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
    return generateKeyBetween(target.rank, succ?.rank ?? null);
  }
}
