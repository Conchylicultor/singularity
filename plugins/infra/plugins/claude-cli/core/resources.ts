import { z } from "zod";
import { resourceDescriptor } from "@plugins/primitives/plugins/live-state/core";
import {
  DEFAULT_MODEL,
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
  parsedTextField,
} from "@plugins/fields/plugins/text/plugins/config/core";
import { intField } from "@plugins/fields/plugins/int/plugins/config/core";
import { dateField } from "@plugins/fields/plugins/date/plugins/config/core";
import { jsonField } from "@plugins/fields/plugins/json/plugins/config/core";

// One recorded `claude --print` call. The physical `claude_cli_calls` table
// (server/internal/tables.ts) and the public `ClaudeCliCall` wire schema below
// both derive from this single field record, so a column ↔ schema drift is
// unrepresentable. Keyed by JS prop name IN COLUMN ORDER.
//
// `model` is a plain `text` column in the DDL, decoded by the tolerant
// `StoredModelSchema` — so the `ConversationModel` in its type is what really
// runs on every read and write, and a legacy/coarse-tier id written before the
// ids were versioned (e.g. `"opus"`) normalizes instead of being handed to
// typed code as if it were a live model. That is the same guard the wire schema
// used to carry alone, now one layer lower, where the server-side readers are.
//
// `DEFAULT_MODEL` is the wire/backfill default, where the tuple form silently
// gave `"fable-5"` — the first entry of the enum, i.e. tuple order rather than
// anyone's decision. Nothing observable changes: the column is notNull with no
// DB default, so every row carries a model and the wire schema's `.default()`
// never fires.
export const claudeCliCallFields = {
  id: uuidField(),
  createdAt: dateField(),
  model: parsedTextField(StoredModelSchema, { default: DEFAULT_MODEL }),
  sourceName: textField(),
  sourceContext: nullable(
    jsonField<Record<string, unknown>>({
      schema: z.record(z.unknown()),
      default: {},
    }),
  ),
  prompt: textField(),
  system: nullable(textField()),
  output: nullable(textField()),
  error: nullable(textField()),
  durationMs: intField(),
  // The domain record this call was made FOR — a run id, a task id, whatever row
  // the caller is explaining. Free-form and NOT namespaced by `sourceName`, so it
  // must be a globally unique row id (a UUID); a per-caller counter would collide
  // across callers and hand one plugin another's calls. Appended last so the
  // record still reads in physical column order.
  correlationId: nullable(textField()),
} satisfies FieldsRecord;

// No `model` re-widening: the field's own schema IS `StoredModelSchema` now, so
// `fieldsToZodObject` already derives the tolerant arm — a legacy/unknown stored
// model normalizes to a concrete one instead of rejecting the row and blanking
// the whole calls array on the WS push path. Overriding it here would restate
// the same schema in a second place, which is the drift this derivation exists
// to remove.
export const ClaudeCliCallSchema = fieldsToZodObject(claudeCliCallFields);
export type ClaudeCliCall = z.infer<typeof ClaudeCliCallSchema>;

export const claudeCliCallsResource = resourceDescriptor<ClaudeCliCall[]>(
  "claude-cli-calls",
  z.array(ClaudeCliCallSchema),
  [],
);
