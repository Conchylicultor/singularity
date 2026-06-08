import { getConversation } from "@plugins/tasks-core/server";
import { db } from "@plugins/database/server";
import { implement, HttpError } from "@plugins/infra/plugins/endpoints/server";
import { stepDownQueue } from "../../shared/endpoints";
import { lockDeck, rankAfterN, reseatGroupMembers, upsertRank, findTaskIdForConversation } from "./queue-ranks";
import { queueRanksResource } from "./resource";
import { getPinnedId, setPinnedId, topWaitingByRank, validatePin } from "./pinned";
import { cascadeBlockedDependents } from "./cascade-blocked";

export const handleStepDown = implement(stepDownQueue, async ({ body }) => {
  const { conversationId, steps } = body;
  const conv = await getConversation(conversationId);
  if (!conv) throw new HttpError(404, "Not found");

  await db.transaction(async (tx) => {
    await lockDeck(tx);
    const rank = await rankAfterN(conversationId, steps, tx);
    await upsertRank(conversationId, rank, tx);
    await reseatGroupMembers(conversationId, rank, tx);
    await cascadeBlockedDependents(conversationId, tx);

    const pinnedId = await getPinnedId(tx);
    if (pinnedId === conversationId) {
      const taskId = await findTaskIdForConversation(conversationId, tx);
      const nextId = await topWaitingByRank(conversationId, taskId ?? undefined, tx);
      await setPinnedId(nextId ?? conversationId, tx);
    } else {
      await validatePin(tx);
    }
  });

  queueRanksResource.notify();
});
