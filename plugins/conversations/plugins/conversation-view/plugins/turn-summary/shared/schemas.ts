import { z } from "zod";
import { resourceDescriptor } from "@plugins/primitives/plugins/live-state/shared";

export const TurnSummarySchema = z.object({
  conversationId: z.string(),
  messageId: z.string(),
  summary: z.string(),
  caveats: z.string(),
  actions: z.string(),
  generatedAt: z.coerce.date(),
});
export type TurnSummary = z.infer<typeof TurnSummarySchema>;

export const TurnSummariesPayloadSchema = z.record(z.string(), TurnSummarySchema);
export type TurnSummariesPayload = z.infer<typeof TurnSummariesPayloadSchema>;

export const turnSummariesResource = resourceDescriptor<TurnSummariesPayload>(
  "turn-summaries",
  TurnSummariesPayloadSchema,
);
