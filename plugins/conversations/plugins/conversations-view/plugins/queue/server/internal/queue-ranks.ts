import { and, asc, desc, eq, gt, lt, ne } from "drizzle-orm";
import { Rank } from "@plugins/primitives/plugins/rank/shared";
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
export async function endRank(): Promise<Rank> {
  const [last] = await joinedWaiting()
    .where(eq(_conversations.status, "waiting"))
    .orderBy(desc(_conversationsExtQueue.rank))
    .limit(1);
  return Rank.between(last?.rank ? Rank.from(last.rank as string) : null, null);
}

// Position 2 of the deck: between the current top and second-place ranks.
// 0 waiting → returns any rank (becomes the only item).
// 1 waiting → returns a rank after that single item.
export async function positionTwoRank(): Promise<Rank> {
  const top2 = await joinedWaiting()
    .where(eq(_conversations.status, "waiting"))
    .orderBy(asc(_conversationsExtQueue.rank))
    .limit(2);
  const top = top2[0]?.rank ? Rank.from(top2[0].rank as string) : null;
  const second = top2[1]?.rank ? Rank.from(top2[1].rank as string) : null;
  return Rank.between(top, second);
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
    return Rank.between(pred?.rank ? Rank.from(pred.rank as string) : null, Rank.from(target.rank as string));
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
    return Rank.between(Rank.from(target.rank as string), succ?.rank ? Rank.from(succ.rank as string) : null);
  }
}
