import { z } from "zod";
import { db } from "@server/db/client";
import { defineJob } from "@plugins/infra/plugins/jobs/server";
import { _conversationProgress } from "./tables";
import { conversationProgressResource } from "./resource";

// Triggered on every `pushLanded` event. Directly sets phase = "pushed" for
// the conversation that initiated the push. No Haiku call — push is reliable
// and immediate, and is the terminal phase regardless of transcript content.
export const markProgressPushedJob = defineJob({
  name: "conversation-progress.mark-pushed",
  input: z.object({}).passthrough(),
  event: z
    .object({
      conversationId: z.string(),
    })
    .passthrough(),
  maxAttempts: 2,
  run: async ({ event }) => {
    const conversationId = event?.conversationId;
    if (!conversationId) return;

    await db
      .insert(_conversationProgress)
      .values({
        conversationId,
        phase: "pushed",
        messageId: null,
        source: "push",
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: _conversationProgress.conversationId,
        set: {
          phase: "pushed",
          messageId: null,
          source: "push",
          updatedAt: new Date(),
        },
      });

    conversationProgressResource.notify();
  },
});
