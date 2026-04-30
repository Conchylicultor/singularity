import { z } from "zod";
import { resourceDescriptor } from "@plugins/primitives/plugins/live-state/shared";

export const PHASE_ORDER = [
  "research",
  "plan",
  "implementation",
  "pushed",
] as const;
export type ConversationPhase = (typeof PHASE_ORDER)[number];

export const PHASE_LABELS: Record<ConversationPhase, string> = {
  research: "Research",
  plan: "Plan",
  implementation: "Implementation",
  pushed: "Pushed",
};

export const ConversationProgressSchema = z.object({
  conversationId: z.string(),
  phase: z.enum(PHASE_ORDER),
  source: z.enum(["haiku", "push"]),
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
  );
