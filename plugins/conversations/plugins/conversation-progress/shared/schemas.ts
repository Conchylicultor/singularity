import { z } from "zod";
import { resourceDescriptor } from "@plugins/primitives/plugins/live-state/core";

export const PHASE_ORDER = [
  "research",
  "design",
  "implementation",
  "pushed",
] as const;
export type ConversationPhase = (typeof PHASE_ORDER)[number];

export const PHASE_LABELS: Record<ConversationPhase, string> = {
  research: "Research",
  design: "Design",
  implementation: "Implementation",
  pushed: "Pushed",
};

export const ConversationProgressSchema = z.object({
  conversationId: z.string(),
  phase: z.enum(PHASE_ORDER),
  source: z.enum(["heuristic", "push"]),
  updatedAt: z.coerce.date(),
});
export type ConversationProgress = z.infer<typeof ConversationProgressSchema>;

export const ConversationProgressPayloadSchema = z.array(
  ConversationProgressSchema,
);
export type ConversationProgressPayload = z.infer<
  typeof ConversationProgressPayloadSchema
>;

export const conversationProgressResource =
  resourceDescriptor<ConversationProgressPayload>(
    "conversation-progress",
    ConversationProgressPayloadSchema,
    [],
    { bootCritical: true },
  );
