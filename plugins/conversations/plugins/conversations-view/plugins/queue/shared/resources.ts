import { z } from "zod";
import { resourceDescriptor } from "@plugins/primitives/plugins/live-state/shared";
import { RankSchema } from "@plugins/primitives/plugins/rank/shared";

export const QueueRankRowSchema = z.object({
  conversationId: z.string(),
  rank: RankSchema,
});
export type QueueRankRow = z.infer<typeof QueueRankRowSchema>;

export const queueRanksResource = resourceDescriptor<QueueRankRow[]>(
  "queue-ranks",
  z.array(QueueRankRowSchema),
  [],
);
