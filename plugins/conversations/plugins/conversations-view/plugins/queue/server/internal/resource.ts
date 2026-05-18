import { db } from "@plugins/database/server";
import { defineResource } from "@plugins/framework/plugins/server-core/core";
import { QueueDataSchema, type QueueData, type QueueRankRow } from "../../shared/resources";
import { conversationsQueue } from "./tables";
import { validatePin } from "./pinned";

export const queueRanksResource = defineResource({
  key: "queue-ranks",
  mode: "push",
  schema: QueueDataSchema,
  loader: async (): Promise<QueueData> => {
    const rows = await db
      .select({
        parentId: conversationsQueue.table.parentId,
        rank: conversationsQueue.table.rank,
      })
      .from(conversationsQueue.table);
    const ranks = rows.map((r) => ({ conversationId: r.parentId, rank: r.rank })) as unknown as QueueRankRow[];
    const pinnedConversationId = await validatePin();
    return { ranks, pinnedConversationId };
  },
});
