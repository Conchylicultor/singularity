import { z } from "zod";
import { keyedResourceDescriptor } from "@plugins/primitives/plugins/live-state/core";
import {
  fieldsToZodObject,
  nullable,
  type FieldsRecord,
} from "@plugins/fields/core";
import {
  textField,
  enumTextField,
} from "@plugins/fields/plugins/text/plugins/config/core";
import { intField } from "@plugins/fields/plugins/int/plugins/config/core";
import { dateField } from "@plugins/fields/plugins/date/plugins/config/core";

// The closed set of semantic phases a summary can be in. Single source of the
// enum: both `PhaseSchema` (the standalone validator the MCP tool reuses) and
// the `phase` column's `enumTextField` derive from it, so the DB column, the
// wire schema, and the tool input can never drift.
export const PHASE_VALUES = [
  "clarification_needed",
  "design_review",
  "implementation_review",
  "investigating",
  "executing",
  "other",
] as const;

export const PhaseSchema = z.enum(PHASE_VALUES);
export type Phase = z.infer<typeof PhaseSchema>;

// One append-only summary row — one per "Summarize" press, never updated. The
// physical table (server) and this wire schema both derive from this single
// field record, so a column/schema drift is unrepresentable. `id` is an
// app-minted text PK (no DB default); `generatedAt` defaults to now() in the DB.
export const conversationSummaryFields = {
  id: textField(),
  conversationId: textField(),
  generatedAt: dateField(),
  model: textField(),
  turnCountAtGeneration: intField(),
  phase: enumTextField(PHASE_VALUES),
  phaseDetail: nullable(textField()),
  flags: nullable(textField()),
  nextAction: textField(),
  notes: nullable(textField()),
} satisfies FieldsRecord;

// Wire shape — what the resource ships and what the web reads. `generatedAt`
// crosses the wire as a Date (`z.coerce.date()` parses the serialised ISO
// string back into a Date on the client).
export const ConversationSummarySchema = fieldsToZodObject(
  conversationSummaryFields,
);
export type ConversationSummary = z.infer<typeof ConversationSummarySchema>;

// One conversation's summary history — a keyed resource parametrized by
// `{ conversationId }`, so each consumer subscribes to exactly ONE
// conversation's summaries (bounded by how often that conversation was
// summarised), never the whole table. A point resource does not fit: its
// identity must be the pk, and the pk is the summary `id` — many rows per
// conversation. NOT preloaded — route-scoped, hydrates post-mount via its
// sub-ack. The server half is a hand-written keyed `defineResource` with
// `identityTable: "conversation_summaries"` (the `pushes-by-attempt` precedent).
//
// Row order on the client is NOT guaranteed latest-first: a scoped upsert
// appends. Read the latest through `useLatestConversationSummary`, which picks
// it by `generatedAt`.
export const conversationSummariesResource = keyedResourceDescriptor<
  ConversationSummary[],
  { conversationId: string }
>(
  "conversation-summaries",
  z.array(ConversationSummarySchema),
  [],
  (r) => (r as ConversationSummary).id,
);
