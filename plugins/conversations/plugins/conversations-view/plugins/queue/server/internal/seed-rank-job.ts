import { z } from "zod";
import { defineJob } from "@plugins/infra/plugins/jobs/server";
import { getConversation, hasBlockingDep, listBlockingDepIds } from "@plugins/tasks-core/server";
import { isTopOfDeck, lockDeck, positionTwoRank, rankAfterBlockers } from "./queue-ranks";
import { conversationsQueue } from "./tables";
import { queueRanksResource } from "./resource";
import { db } from "@plugins/database/server";

// Bound to both `conversationCreated` and `conversationTurnCompleted`. Every
// fire seeds the conversation at "position 2" (one slot below the current
// top), which gives the Anki-style cycling: a fresh conversation lands just
// below what the user is working on.
//
// The position-1 conversation is never demoted: if it already holds the top
// rank when its turn completes, the existing rank is preserved. This keeps
// the user's active focus stable while new/returning conversations slot in
// behind it.
//
// When the conversation's task has blocking dependencies, it instead slots
// after the last waiting blocker conversation.
//
// Crucially, this is NOT triggered by status transitions — recovering a `gone`
// conversation drives `gone → working → waiting` without producing a
// `conversationTurnCompleted`, so the original rank is preserved by
// construction.
//
// The rank read + write runs inside a transaction with FOR UPDATE on the
// deck rows so concurrent seeders serialize instead of producing collisions.
export const seedRankJob = defineJob({
  name: "queue.seed-rank",
  input: z.object({}).passthrough(),
  event: z.object({ conversationId: z.string() }).passthrough(),
  maxAttempts: 2,
  run: async ({ event }) => {
    const conversationId = event?.conversationId;
    if (!conversationId) return;

    const conv = await getConversation(conversationId);

    await db.transaction(async (tx) => {
      await lockDeck(tx);

      if (await isTopOfDeck(conversationId, tx)) return;

      let rank;
      if (conv?.taskId && (await hasBlockingDep(conv.taskId))) {
        const blockingTaskIds = await listBlockingDepIds(conv.taskId);
        rank = await rankAfterBlockers(conversationId, blockingTaskIds, tx);
      } else {
        rank = await positionTwoRank(conversationId, tx);
      }

      const now = new Date();
      await tx
        .insert(conversationsQueue.table)
        .values({ parentId: conversationId, rank: rank.toJSON(), updatedAt: now })
        .onConflictDoUpdate({
          target: conversationsQueue.table.parentId,
          set: { rank: rank.toJSON(), updatedAt: now },
        });
    });

    queueRanksResource.notify();
  },
});
