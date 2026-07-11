import { db, currentTxId } from "@plugins/database/server";
import { implement } from "@plugins/infra/plugins/endpoints/server";
import { reorderQueue } from "../../core/endpoints";
import { lockDeck, rankAdjacentTo, reseatGroupMembers, upsertRank } from "./queue-ranks";
import { validatePin } from "./pinned";
import { cascadeBlockedDependents } from "./cascade-blocked";

export const handleReorder = implement(reorderQueue, async ({ body }) => {
  const { conversationId, targetId, zone } = body;
  if (conversationId === targetId) return { watermark: undefined };

  const watermark = await db.transaction(async (tx) => {
    await lockDeck(tx);
    const rank = await rankAdjacentTo(targetId, zone, tx);
    await upsertRank(conversationId, rank, tx);
    await reseatGroupMembers(conversationId, rank, tx);
    await cascadeBlockedDependents(conversationId, tx);
    await validatePin(tx);

    // Ack token: the commit's xid8, read inside the write transaction (Rule A).
    return currentTxId(tx);
  });

  return { watermark };
});
