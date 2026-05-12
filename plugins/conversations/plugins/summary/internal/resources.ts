import { z } from "zod";
import { resourceDescriptor } from "@plugins/primitives/plugins/live-state/core";

export const PhaseSchema = z.enum([
  "clarification_needed",
  "design_review",
  "implementation_review",
  "investigating",
  "executing",
  "other",
]);
export type Phase = z.infer<typeof PhaseSchema>;

// Wire shape — what the resource ships and what the web reads.
// Mirrors the DB row but with strings for dates so it serialises cleanly.
export const ConversationSummarySchema = z.object({
  id: z.string(),
  conversationId: z.string(),
  generatedAt: z.string(),
  model: z.string(),
  turnCountAtGeneration: z.number().int(),
  phase: PhaseSchema,
  phaseDetail: z.string().nullable(),
  flags: z.string().nullable(),
  nextAction: z.string(),
  notes: z.string().nullable(),
});
export type ConversationSummary = z.infer<typeof ConversationSummarySchema>;

// Latest-first per conversation. Keyed by conversationId for O(1) lookup
// from the per-conversation toolbar button.
export const conversationSummariesResource = resourceDescriptor<
  Record<string, ConversationSummary[]>
>("conversation-summaries", z.record(z.array(ConversationSummarySchema)), {});
