import { z } from "zod";
import { eq } from "drizzle-orm";
import { defineJob } from "@plugins/infra/plugins/jobs/server";
import { lockDeck, rankForTop } from "./queue-ranks";
import { conversationsQueue } from "./tables";
import { queueRanksResource } from "./resource";
import { validatePin } from "./pinned";
import { db } from "@plugins/database/server";

// Fired on `conversationCreated` only. Seeds the conversation's rank at the
// top of the queue (newest first). Idempotent — if the conversation already
// has a rank entry, no change is made.
//
// After seeding, calls `validatePin()` to set the pinned conversation if none
// exists yet.
export const seedRankJob = defineJob({
  name: "queue.seed-rank",
  input: z.object({}).passthrough(),
  event: z.object({ conversationId: z.string() }).passthrough(),
  maxAttempts: 2,
  run: async ({ event }) => {
    const conversationId = event?.conversationId;
    if (!conversationId) return;

    await db.transaction(async (tx) => {
      await lockDeck(tx);

      const [existing] = await tx
        .select({ rank: conversationsQueue.table.rank })
        .from(conversationsQueue.table)
        .where(eq(conversationsQueue.table.parentId, conversationId))
        .limit(1);
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard, no noUncheckedIndexedAccess
      if (existing) return;

      const rank = await rankForTop(conversationId, tx);
      const now = new Date();
      await tx
        .insert(conversationsQueue.table)
        .values({ parentId: conversationId, rank: rank.toJSON(), updatedAt: now })
        .onConflictDoUpdate({
          target: conversationsQueue.table.parentId,
          set: { rank: rank.toJSON(), updatedAt: now },
        });
    });

    await validatePin();
    queueRanksResource.notify();
  },
});
