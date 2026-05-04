import { z } from "zod";
import { db } from "@server/db/client";
import { defineResource } from "@server/resources";
import { QueueRankRowSchema, type QueueRankRow } from "../../shared/resources";
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
    return rows.map((r) => ({ conversationId: r.parentId, rank: r.rank }));
  },
});
