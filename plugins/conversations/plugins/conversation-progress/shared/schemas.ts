import { z } from "zod";
import { queryResourceDescriptor } from "@plugins/infra/plugins/query-resource/core";

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

// Keyed query-resource contract: rows key on `conversationId` — the ALIAS the
// server projection exposes the side-table's `parent_id` PK under. The server
// half is compiled from the drizzle declaration in `server/internal/resource.ts`;
// the wire shape stays `ConversationProgress[]`.
export const conversationProgressResource =
  queryResourceDescriptor<ConversationProgress>(
    "conversation-progress",
    ConversationProgressSchema,
    "conversationId",
    { bootCritical: true },
  );
