import { z } from "zod";
import { eq } from "drizzle-orm";
import { defineJob } from "@plugins/infra/plugins/jobs/server";
import { lockDeck, rankForTop, rankJoiningGroup, findTaskIdForConversation, upsertRank } from "./queue-ranks";
import { queueRanksResource } from "./resource";
import { validatePin } from "./pinned";
import { db } from "@plugins/database/server";
import { conversationsQueue } from "./tables";

export const seedRankJob = defineJob({
  name: "queue.seed-rank",
  input: z.object({}).passthrough(),
  event: z.object({ conversationId: z.string() }).passthrough(),
  dedup: "none",
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

      // If the task already has a group, join it rather than going to top.
      const taskId = await findTaskIdForConversation(conversationId, tx);
      let rank;
      if (taskId) {
        const groupRank = await rankJoiningGroup(taskId, conversationId, tx);
        rank = groupRank ?? await rankForTop(conversationId, tx);
      } else {
        rank = await rankForTop(conversationId, tx);
      }
      await upsertRank(conversationId, rank, tx);
    });

    await validatePin();
    queueRanksResource.notify();
  },
});
