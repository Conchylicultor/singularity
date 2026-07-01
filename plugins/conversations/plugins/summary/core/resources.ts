import { z } from "zod";
import { resourceDescriptor } from "@plugins/primitives/plugins/live-state/core";
import { fieldsToZodObject, nullable, type FieldsRecord } from "@plugins/fields/core";
import { textField, enumTextField } from "@plugins/fields/plugins/text/plugins/config/core";
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
  id:                    textField(),
  conversationId:        textField(),
  generatedAt:           dateField(),
  model:                 textField(),
  turnCountAtGeneration: intField(),
  phase:                 enumTextField(PHASE_VALUES),
  phaseDetail:           nullable(textField()),
  flags:                 nullable(textField()),
  nextAction:            textField(),
  notes:                 nullable(textField()),
} satisfies FieldsRecord;

// Wire shape — what the resource ships and what the web reads. `generatedAt`
// crosses the wire as a Date (`z.coerce.date()` parses the serialised ISO
// string back into a Date on the client).
export const ConversationSummarySchema = fieldsToZodObject(conversationSummaryFields);
export type ConversationSummary = z.infer<typeof ConversationSummarySchema>;

// Latest-first per conversation. Keyed by conversationId for O(1) lookup
// from the per-conversation toolbar button.
export const conversationSummariesResource = resourceDescriptor<
  Record<string, ConversationSummary[]>
>("conversation-summaries", z.record(z.array(ConversationSummarySchema)), {});
