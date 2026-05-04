import { z } from "zod";
import { defineJob } from "@plugins/infra/plugins/jobs/server";
import { positionTwoRank } from "./queue-ranks";
import { conversationsQueue } from "./tables";
import { queueRanksResource } from "./resource";

// Bound to both `conversationCreated` and `conversationTurnCompleted`. Every
// fire seeds the conversation at "position 2" (one slot below the current
// top), which gives the Anki-style cycling: a fresh conversation lands just
// below what the user is working on, and a conversation that finishes a turn
// re-slots into the same spot. Crucially, this is NOT triggered by status
// transitions — recovering a `gone` conversation drives `gone → working →
// waiting` without producing a `conversationTurnCompleted`, so the original
// rank is preserved by construction.
export const seedRankJob = defineJob({
  name: "queue.seed-rank",
  input: z.object({}).passthrough(),
  event: z.object({ conversationId: z.string() }).passthrough(),
  maxAttempts: 2,
  run: async ({ event }) => {
    const conversationId = event?.conversationId;
    if (!conversationId) return;
    const rank = await positionTwoRank();
    await conversationsQueue.upsert(conversationId, { rank: rank.toJSON() });
    queueRanksResource.notify();
  },
});
