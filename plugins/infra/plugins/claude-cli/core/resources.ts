import { z } from "zod";
import { resourceDescriptor } from "@plugins/primitives/plugins/live-state/core";
import {
  ConversationModelSchema,
  StoredModelSchema,
} from "@plugins/conversations/plugins/model-provider/core";
import {
  fieldsToZodObject,
  nullable,
  type FieldsRecord,
} from "@plugins/fields/core";
import { uuidField } from "@plugins/fields/plugins/uuid/plugins/config/core";
import {
  textField,
  enumTextField,
} from "@plugins/fields/plugins/text/plugins/config/core";
import { intField } from "@plugins/fields/plugins/int/plugins/config/core";
import { dateField } from "@plugins/fields/plugins/date/plugins/config/core";
import { jsonField } from "@plugins/fields/plugins/json/plugins/config/core";

// One recorded `claude --print` call. The physical `claude_cli_calls` table
// (server/internal/tables.ts) and the public `ClaudeCliCall` wire schema below
// both derive from this single field record, so a column ↔ schema drift is
// unrepresentable. Keyed by JS prop name IN COLUMN ORDER.
//
// `model` is a `text` column branded with `ConversationModel` (the `$type`
// brand is TS-only — the DDL stays plain text). The wire schema overrides it
// with the tolerant `StoredModelSchema` below.
export const claudeCliCallFields = {
  id: uuidField(),
  createdAt: dateField(),
  model: enumTextField(ConversationModelSchema.options),
  sourceName: textField(),
  sourceContext: nullable(
    jsonField<Record<string, unknown>>({ schema: z.record(z.unknown()), default: {} }),
  ),
  prompt: textField(),
  system: nullable(textField()),
  output: nullable(textField()),
  error: nullable(textField()),
  durationMs: intField(),
} satisfies FieldsRecord;

export const ClaudeCliCallSchema = fieldsToZodObject(claudeCliCallFields).extend({
  // Tolerant by construction (see StoredModelSchema): a legacy/coarse-tier or
  // otherwise-unknown stored model normalizes to a concrete model instead of
  // rejecting the row — which would blank the whole calls array on the WS push
  // path. The DB column stays plain text (see `model` above).
  model: StoredModelSchema,
});
export type ClaudeCliCall = z.infer<typeof ClaudeCliCallSchema>;

export const claudeCliCallsResource = resourceDescriptor<ClaudeCliCall[]>(
  "claude-cli-calls",
  z.array(ClaudeCliCallSchema),
  [],
);
