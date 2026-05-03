import { z } from "zod";
import { defineJob } from "@plugins/infra/plugins/jobs/server";
import { upsertExtension } from "@plugins/infra/plugins/entity-extensions/server";
import { positionTwoRank } from "./queue-ranks";
import { _conversationsExtQueue } from "./tables";
import { queueRanksResource } from "./resource";

// Bound to `conversationTurnCompleted`. Every fire seeds the conversation at
// "position 2" (one slot below the current top), giving Anki-style cycling:
// a conversation that finishes a turn re-slots just below the top so the top
// stays stable. New conversations have no rank until their first turn fires
// this job; the queue view floats them above ranked items in the meantime.
// Crucially, this is NOT triggered by status transitions — recovering a `gone`
// conversation drives `gone → working → waiting` without producing a
// `conversationTurnCompleted`, so the original rank is preserved by construction.
export const seedRankJob = defineJob({
  name: "queue.seed-rank",
  input: z.object({}).passthrough(),
  event: z.object({ conversationId: z.string() }).passthrough(),
  maxAttempts: 2,
  run: async ({ event }) => {
    const conversationId = event?.conversationId;
    if (!conversationId) return;
    const rank = await positionTwoRank();
    await upsertExtension(_conversationsExtQueue, conversationId, { rank });
    queueRanksResource.notify();
  },
});
