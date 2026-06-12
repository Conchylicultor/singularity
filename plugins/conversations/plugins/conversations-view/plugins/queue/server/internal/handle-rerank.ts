import { getConversation } from "@plugins/tasks/plugins/tasks-core/server";
import { db } from "@plugins/database/server";
import { implement, HttpError } from "@plugins/infra/plugins/endpoints/server";
import { rerankQueue } from "../../shared/endpoints";
import { lockDeck, rankForTop, rankJoiningGroup, upsertRank } from "./queue-ranks";
import { queueRanksResource } from "./resource";
import { validatePin } from "./pinned";

export const handleRerank = implement(rerankQueue, async ({ body }) => {
  const { conversationId } = body;
  const conv = await getConversation(conversationId);
  if (!conv) throw new HttpError(404, "Not found");

  await db.transaction(async (tx) => {
    await lockDeck(tx);
    // If the task already has a group in the queue, join it; otherwise go to top.
    const groupRank = await rankJoiningGroup(conv.taskId, conversationId, tx);
    const rank = groupRank ?? await rankForTop(conversationId, tx);
    await upsertRank(conversationId, rank, tx);
    await validatePin(tx);
  });

  queueRanksResource.notify();
});
