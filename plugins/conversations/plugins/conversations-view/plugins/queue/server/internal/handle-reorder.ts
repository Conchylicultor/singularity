import { db } from "@plugins/database/server";
import { implement } from "@plugins/infra/plugins/endpoints/server";
import { reorderQueue } from "../../shared/endpoints";
import { lockDeck, rankAdjacentTo, reseatGroupMembers, upsertRank } from "./queue-ranks";
import { queueRanksResource } from "./resource";
import { validatePin } from "./pinned";
import { cascadeBlockedDependents } from "./cascade-blocked";

export const handleReorder = implement(reorderQueue, async ({ body }) => {
  const { conversationId, targetId, zone } = body;
  if (conversationId === targetId) return;

  await db.transaction(async (tx) => {
    await lockDeck(tx);
    const rank = await rankAdjacentTo(targetId, zone, tx);
    await upsertRank(conversationId, rank, tx);
    await reseatGroupMembers(conversationId, rank, tx);
    await cascadeBlockedDependents(conversationId, tx);
    await validatePin(tx);
  });

  queueRanksResource.notify();
});
