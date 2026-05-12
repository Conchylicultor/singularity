import { z } from "zod";
import { resourceDescriptor } from "@plugins/primitives/plugins/live-state/core";
import { RankSchema } from "@plugins/primitives/plugins/rank/core";

export const QueueRankRowSchema = z.object({
  conversationId: z.string(),
  rank: RankSchema,
});
export type QueueRankRow = z.infer<typeof QueueRankRowSchema>;

export const QueueDataSchema = z.object({
  ranks: z.array(QueueRankRowSchema),
  pinnedConversationId: z.string().nullable(),
});
export type QueueData = z.infer<typeof QueueDataSchema>;

export const queueRanksResource = resourceDescriptor<QueueData>(
  "queue-ranks",
  QueueDataSchema,
  { ranks: [], pinnedConversationId: null },
);
