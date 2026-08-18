import { z } from "zod";
import { eq } from "drizzle-orm";
import { defineJob } from "@plugins/infra/plugins/jobs/server";
import {
  lockDeck,
  rankForTop,
  seatJoiningGroup,
  findTaskIdForConversation,
  upsertRank,
} from "./queue-ranks";
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
      if (existing) return;

      // If the task already has a group, take its seat — position AND pin —
      // rather than going to top as a fresh unpinned row.
      const taskId = await findTaskIdForConversation(conversationId, tx);
      const seat = taskId
        ? await seatJoiningGroup(taskId, conversationId, tx)
        : null;
      const rank = seat?.rank ?? (await rankForTop(conversationId, tx));
      await upsertRank(conversationId, rank, tx, seat?.pinned ?? false);
    });
  },
});
