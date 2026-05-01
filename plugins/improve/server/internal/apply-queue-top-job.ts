import { z } from "zod";
import { asc, and, eq, isNotNull } from "drizzle-orm";
import { generateKeyBetween } from "fractional-indexing";
import { db } from "@server/db/client";
import { defineJob } from "@plugins/infra/plugins/jobs/server";
import {
  _conversations,
  getConversation,
  updateConversation,
  recentConversationsResource,
} from "@plugins/tasks-core/server";
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

    // Insert before the current top waiting conversation
    const [first] = await db
      .select({ rank: _conversations.rank })
      .from(_conversations)
      .where(and(eq(_conversations.status, "waiting"), isNotNull(_conversations.rank)))
      .orderBy(asc(_conversations.rank))
      .limit(1);

    const topRank = generateKeyBetween(null, first?.rank ?? null);
    await updateConversation(event.conversationId, { rank: topRank });
    recentConversationsResource.notify();
  },
});
