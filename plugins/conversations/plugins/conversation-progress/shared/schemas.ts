import { z } from "zod";
import { pointQueryResourceDescriptor } from "@plugins/infra/plugins/query-resource/core";
import { parsedTextField } from "@plugins/fields/plugins/text/plugins/config/core";
import { defineExtensionShape } from "@plugins/infra/plugins/entity-extensions/core";

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

// One line per phase, for someone seeing the progress bar for the first time —
// each restates the rule the heuristic job classifies by.
export const PHASE_DESCRIPTIONS: Record<ConversationPhase, string> = {
  research: "Reading and exploring — no files changed yet.",
  design: "Writing a plan — only files under research/ changed.",
  implementation: "Changing code in its worktree.",
  pushed: "Its work is merged into main.",
};

/** The steps of the progress bar, in order, with their tooltip copy. */
export const PHASE_STEPS = PHASE_ORDER.map((p) => ({
  id: p,
  label: PHASE_LABELS[p],
  description: PHASE_DESCRIPTIONS[p],
}));

/** What the progress bar tracks — the steps tooltip's subtitle. */
export const PROGRESS_SUMMARY = "How far this agent has got with its task";

// The two enums the progress row is made of, each written once: these ARE the
// decoders of the `phase` / `source` columns (the fields of the shape below,
// which server/internal/tables.ts builds the table from) and the wire schema's
// own members, so the stored set and the pushed set cannot drift apart.
export const ProgressPhaseSchema = z.enum(PHASE_ORDER);
// How the phase was decided: inferred from the transcript, or observed from a push.
export const ProgressSourceSchema = z.enum(["heuristic", "push"]);

// The `conversations_ext_progress` row, declared once: the table and the wire
// row both come from this shape. The `default`s are wire defaults only — the
// columns have no DB default, and every write sets both. `updatedAt` is the one
// timestamp put on the wire.
export const conversationProgressShape = defineExtensionShape({
  key: "conversationId",
  fields: {
    phase: parsedTextField(ProgressPhaseSchema, { default: "research" }),
    source: parsedTextField(ProgressSourceSchema, { default: "heuristic" }),
  },
  wireTimestamps: ["updatedAt"],
});
export const ConversationProgressSchema = conversationProgressShape.schema;
export type ConversationProgress = z.infer<typeof ConversationProgressSchema>;

// Bounded POINT resource: a consumer subscribes by an explicit conversation-id
// set (`usePointResource(resource, convId)` → one row-or-null), so a progress
// read costs O(1) instead of an O(n) `.find()` over the whole collection. Rows
// key on `conversationId` — the extension's key, whose column is the
// side-table's `parent_id` PK (which IS the point identity). NOT
// preloaded: point resources hydrate post-mount (the recorded decision), and
// the progress bar simply renders nothing for the one round-trip.
export const conversationProgressResource =
  pointQueryResourceDescriptor<ConversationProgress>(
    "conversation-progress",
    ConversationProgressSchema,
    "conversationId",
  );
