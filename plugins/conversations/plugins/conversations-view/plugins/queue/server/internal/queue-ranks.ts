import { and, asc, desc, eq, gt, isNotNull, lt, ne } from "drizzle-orm";
import { generateKeyBetween } from "fractional-indexing";
import { db } from "@server/db/client";
import { _conversations } from "@plugins/tasks-core/server";

function waitingWithRank() {
  return and(eq(_conversations.status, "waiting"), isNotNull(_conversations.rank));
}

// Rank that places a conversation before all currently-waiting conversations.
export async function rankForTop(excludeId: string): Promise<string> {
  const [first] = await db
    .select({ rank: _conversations.rank })
    .from(_conversations)
    .where(and(waitingWithRank(), ne(_conversations.id, excludeId)))
    .orderBy(asc(_conversations.rank))
    .limit(1);
  return generateKeyBetween(null, first?.rank ?? null);
}

// Rank that places a conversation after all currently-waiting conversations.
export async function rankForBottom(excludeId: string): Promise<string> {
  const [last] = await db
    .select({ rank: _conversations.rank })
    .from(_conversations)
    .where(and(waitingWithRank(), ne(_conversations.id, excludeId)))
    .orderBy(desc(_conversations.rank))
    .limit(1);
  return generateKeyBetween(last?.rank ?? null, null);
}

// Rank that slots a conversation immediately before or after targetId in the
// ordered deck. Looks up targetId's current rank from the DB, then finds its
// neighbour in the given direction to compute the midpoint rank.
export async function rankAdjacentTo(
  targetId: string,
  zone: "before" | "after",
): Promise<string> {
  const [target] = await db
    .select({ rank: _conversations.rank })
    .from(_conversations)
    .where(eq(_conversations.id, targetId))
    .limit(1);
  if (!target?.rank) throw new Error(`No rank for conversation ${targetId}`);

  if (zone === "before") {
    const [pred] = await db
      .select({ rank: _conversations.rank })
      .from(_conversations)
      .where(and(waitingWithRank(), lt(_conversations.rank, target.rank)))
      .orderBy(desc(_conversations.rank))
      .limit(1);
    return generateKeyBetween(pred?.rank ?? null, target.rank);
  } else {
    const [succ] = await db
      .select({ rank: _conversations.rank })
      .from(_conversations)
      .where(and(waitingWithRank(), gt(_conversations.rank, target.rank)))
      .orderBy(asc(_conversations.rank))
      .limit(1);
    return generateKeyBetween(target.rank, succ?.rank ?? null);
  }
}
