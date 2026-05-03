import { z } from "zod";
import { db } from "@server/db/client";
import { defineResource } from "@server/resources";
import { QueueRankRowSchema, type QueueRankRow } from "../../shared/resources";
import { _conversationsExtQueue } from "./tables";

export const queueRanksResource = defineResource({
  key: "queue-ranks",
  mode: "push",
  schema: z.array(QueueRankRowSchema),
  loader: async (): Promise<QueueRankRow[]> => {
    const rows = await db
      .select({
        parentId: _conversationsExtQueue.parentId,
        rank: _conversationsExtQueue.rank,
      })
      .from(_conversationsExtQueue);
    return rows.map((r) => ({ conversationId: r.parentId, rank: r.rank }));
  },
});
