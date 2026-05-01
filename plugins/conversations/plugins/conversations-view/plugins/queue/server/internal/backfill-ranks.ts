import { and, asc, desc, eq, isNotNull, isNull, ne } from "drizzle-orm";
import { generateKeyBetween } from "fractional-indexing";
import { db } from "@server/db/client";
import { _conversations } from "@plugins/tasks-core/server";

// Backfill ranks for any active conversation row that pre-dates the queue
// feature. Runs once on plugin onReady; the WHERE clause makes it idempotent
// — re-runs after backfill find no rows.
export async function backfillRanks(): Promise<void> {
  const missing = await db
    .select({ id: _conversations.id })
    .from(_conversations)
    .where(and(isNull(_conversations.rank), ne(_conversations.status, "gone")))
    .orderBy(asc(_conversations.createdAt));

  if (missing.length === 0) return;

  const [last] = await db
    .select({ rank: _conversations.rank })
    .from(_conversations)
    .where(isNotNull(_conversations.rank))
    .orderBy(desc(_conversations.rank))
    .limit(1);

  let cursor: string | null = last?.rank ?? null;
  for (const { id } of missing) {
    const next = generateKeyBetween(cursor, null);
    await db
      .update(_conversations)
      .set({ rank: next })
      .where(eq(_conversations.id, id));
    cursor = next;
  }
}
