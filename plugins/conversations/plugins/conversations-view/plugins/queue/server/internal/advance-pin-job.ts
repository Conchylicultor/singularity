import { z } from "zod";
import { defineJob } from "@plugins/infra/plugins/jobs/server";
import { findTaskIdForConversation } from "./queue-ranks";
import { getPinnedId, setPinnedId, topWaitingByRank } from "./pinned";

export const advancePinJob = defineJob({
  name: "queue.advance-pin",
  input: z.object({}).passthrough(),
  event: z.object({ conversationId: z.string() }).passthrough(),
  dedup: "none",
  maxAttempts: 2,
  run: async ({ event }) => {
    const conversationId = event?.conversationId;
    if (!conversationId) return;

    const pinnedId = await getPinnedId();
    if (pinnedId !== conversationId) return;

    // Exclude the entire task group so the pin advances to a different group.
    const taskId = await findTaskIdForConversation(conversationId);
    const nextId = await topWaitingByRank(conversationId, taskId ?? undefined);
    await setPinnedId(nextId);
  },
});
