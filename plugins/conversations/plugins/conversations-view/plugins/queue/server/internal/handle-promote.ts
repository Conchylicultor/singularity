import { getConversation, hasBlockingDep } from "@plugins/tasks/plugins/tasks-core/server";
import { db } from "@plugins/database/server";
import { implement, HttpError } from "@plugins/infra/plugins/endpoints/server";
import { promoteQueue } from "../../shared/endpoints";
import { lockDeck, rankForTop, reseatGroupMembers, upsertRank } from "./queue-ranks";
import { queueRanksResource } from "./resource";
import { setPinnedId, validatePin } from "./pinned";

export const handlePromote = implement(promoteQueue, async ({ body }) => {
  const { conversationId } = body;
  const conv = await getConversation(conversationId);
  if (!conv) throw new HttpError(404, "Not found");

  await db.transaction(async (tx) => {
    await lockDeck(tx);
    const rank = await rankForTop(conversationId, tx);
    await upsertRank(conversationId, rank, tx);
    await reseatGroupMembers(conversationId, rank, tx);

    const blocked = await hasBlockingDep(conv.taskId);
    if (blocked) {
      await validatePin(tx);
    } else {
      await setPinnedId(conversationId, tx);
    }
  });

  queueRanksResource.notify();
});
