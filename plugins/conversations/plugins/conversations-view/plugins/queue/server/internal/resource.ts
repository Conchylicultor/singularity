import { db } from "@plugins/database/server";
import { defineResource } from "@plugins/framework/plugins/server-core/core";
import {
  queueRanksResource as queueRanksDescriptor,
  type QueueData,
  type QueueRankRow,
} from "../../core/resources";
import { conversationsQueue } from "./tables";
import { getPinnedId } from "./pinned";

// Pure read. Ranks are mutated only by the queue's own handlers/jobs; the pin
// is written transactionally by those same handlers and revalidated on
// conversation status changes by `pinRevalidateJob` (bound to
// `conversation.statusChanged`). Both rank rows and the pin live in DB tables,
// so the DB change-feed invalidates this resource on every write. The loader
// therefore never re-validates or writes — it just reads current rank rows +
// the persisted pin. There is deliberately NO dependsOn the conversations
// resource: a status tick does not change a rank row, and pin revalidation now
// arrives via the explicit event.
export const queueRanksResource = defineResource(queueRanksDescriptor, {
  mode: "push",
  loader: async (): Promise<QueueData> => {
    const rows = await db
      .select({
        parentId: conversationsQueue.table.parentId,
        rank: conversationsQueue.table.rank,
      })
      .from(conversationsQueue.table);
    const ranks = rows.map((r) => ({ conversationId: r.parentId, rank: r.rank })) as unknown as QueueRankRow[];
    const pinnedConversationId = await getPinnedId();
    return { ranks, pinnedConversationId };
  },
});
