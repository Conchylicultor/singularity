import { z } from "zod";
import { resourceDescriptor } from "@plugins/primitives/plugins/live-state/shared";

export const QueueRankRowSchema = z.object({
  conversationId: z.string(),
  rank: z.string(),
});
export type QueueRankRow = z.infer<typeof QueueRankRowSchema>;

export const queueRanksResource = resourceDescriptor<QueueRankRow[]>(
  "queue-ranks",
  z.array(QueueRankRowSchema),
);
