import { z } from "zod";
import { db } from "@plugins/database/server";
import { defineResource } from "@server/resources";
import { QueueRankRowSchema, type QueueRankRow } from "../../internal/resources";
import { conversationsQueue } from "./tables";

export const queueRanksResource = defineResource({
  key: "queue-ranks",
  mode: "push",
  schema: z.array(QueueRankRowSchema),
  loader: async (): Promise<QueueRankRow[]> => {
    const rows = await db
      .select({
        parentId: conversationsQueue.table.parentId,
        rank: conversationsQueue.table.rank,
      })
      .from(conversationsQueue.table);
    return rows.map((r) => ({ conversationId: r.parentId, rank: r.rank })) as unknown as QueueRankRow[];
  },
});
