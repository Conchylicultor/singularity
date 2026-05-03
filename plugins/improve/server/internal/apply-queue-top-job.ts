import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@server/db/client";
import { defineJob } from "@plugins/infra/plugins/jobs/server";
import { upsertExtension } from "@plugins/infra/plugins/entity-extensions/server";
import { getConversation } from "@plugins/tasks-core/server";
import {
  _conversationsExtQueue,
  queueRanksResource,
  rankForTop,
} from "@plugins/conversations/plugins/conversations-view/plugins/queue/server";
import { _improvePendingQueueTop } from "./tables";

export const applyQueueTopJob = defineJob({
  name: "improve.apply-queue-top",
  input: z.object({}),
  event: z.object({ conversationId: z.string() }).passthrough(),
  maxAttempts: 3,
  run: async ({ event }) => {
    if (!event?.conversationId) return;

    const conv = await getConversation(event.conversationId);
    if (!conv) return;

    const [pending] = await db
      .select()
      .from(_improvePendingQueueTop)
      .where(eq(_improvePendingQueueTop.taskId, conv.taskId))
      .limit(1);

    if (!pending) return;

    await db
      .delete(_improvePendingQueueTop)
      .where(eq(_improvePendingQueueTop.taskId, conv.taskId));

    const topRank = await rankForTop(event.conversationId);
    await upsertExtension(_conversationsExtQueue, event.conversationId, {
      rank: topRank,
    });
    queueRanksResource.notify();
  },
});
