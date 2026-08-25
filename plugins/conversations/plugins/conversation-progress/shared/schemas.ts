import { z } from "zod";
import { pointQueryResourceDescriptor } from "@plugins/infra/plugins/query-resource/core";

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

// The two enums the progress row is made of, each written once: these ARE the
// decoders of the `phase` / `source` columns (see server/internal/tables.ts) and
// the wire schema's own members, so the stored set and the pushed set cannot
// drift apart.
export const ProgressPhaseSchema = z.enum(PHASE_ORDER);
// How the phase was decided: inferred from the transcript, or observed from a push.
export const ProgressSourceSchema = z.enum(["heuristic", "push"]);

export const ConversationProgressSchema = z.object({
  conversationId: z.string(),
  phase: ProgressPhaseSchema,
  source: ProgressSourceSchema,
  updatedAt: z.coerce.date(),
});
export type ConversationProgress = z.infer<typeof ConversationProgressSchema>;

// Bounded POINT resource: a consumer subscribes by an explicit conversation-id
// set (`usePointResource(resource, convId)` → one row-or-null), so a progress
// read costs O(1) instead of an O(n) `.find()` over the whole collection. Rows
// key on `conversationId` — the ALIAS the server projection exposes the
// side-table's `parent_id` PK under (which IS the point identity). NOT
// bootCritical: point resources hydrate post-mount (the recorded decision), and
// the progress bar simply renders nothing for the one round-trip.
export const conversationProgressResource =
  pointQueryResourceDescriptor<ConversationProgress>(
    "conversation-progress",
    ConversationProgressSchema,
    "conversationId",
  );
