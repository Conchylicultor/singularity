import { z } from "zod";
import { defineJob } from "@plugins/infra/plugins/jobs/server";
import { getPinnedId, setPinnedId, topWaitingByRank } from "./pinned";
import { queueRanksResource } from "./resource";

// Fired on `userTurnSent`. When the user sends a turn to the pinned
// conversation, advance the pin to the next waiting conversation by rank.
export const advancePinJob = defineJob({
  name: "queue.advance-pin",
  input: z.object({}).passthrough(),
  event: z.object({ conversationId: z.string() }).passthrough(),
  maxAttempts: 2,
  run: async ({ event }) => {
    const conversationId = event?.conversationId;
    if (!conversationId) return;

    const pinnedId = await getPinnedId();
    if (pinnedId !== conversationId) return;

    const nextId = await topWaitingByRank(conversationId);
    await setPinnedId(nextId);
    queueRanksResource.notify();
  },
});
