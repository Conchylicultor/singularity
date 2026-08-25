import type { FieldsRecord } from "@plugins/fields/core";
import { nullable } from "@plugins/fields/core";
import {
  textField,
  enumTextField,
  parsedTextField,
} from "@plugins/fields/plugins/text/plugins/config/core";
import { boolField } from "@plugins/fields/plugins/bool/plugins/config/core";
import { dateField } from "@plugins/fields/plugins/date/plugins/config/core";
import { rankField } from "@plugins/fields/plugins/rank/plugins/config/core";
import {
  DEFAULT_MODEL,
  StoredModelSchema,
} from "@plugins/conversations/plugins/model-provider/core";
import { ConversationStatusSchema } from "../conversation-status";

// Web-safe field records for the tasks / attempts / task_dependencies / pushes /
// conversations FK cluster. One `FieldsRecord` per table, keyed by JS prop name
// IN COLUMN ORDER (matching `server/internal/tables.ts`). `defineEntity` (server
// only) derives the physical pgTable from these; `core/internal/schema.ts`
// derives the public wire schemas from the SAME records via `fieldsToZodObject`.
//
// Living in `core/` keeps these off the server-only `defineEntity` path so the
// browser can evaluate the public schemas without dragging in
// `drizzle-orm/pg-core` / the `fields.storage` server registry.
//
// Nullability rides on the field schema (`nullable(...)` ⇒ no `.notNull()`); DB
// defaults and FKs are DDL-only and declared in the entity meta, not here.

export const taskFields = {
  id: textField(),
  // Display-only organization hierarchy (a "folder"). NOT a dependency.
  folderId: nullable(textField()),
  groupId: nullable(textField()),
  // Monotone dependency-tree membership label (union-find representative =
  // min(id) over the cluster). NULL ⇒ never unioned ⇒ its own singleton cluster.
  // Grows on edge creation, NEVER shrinks on edge removal — that is the point.
  clusterId: nullable(textField()),
  title: textField(),
  // Whether `title` is a machine-generated label rather than human-authored.
  titleAuto: boolField(),
  description: nullable(textField()),
  // "user" for UI-created tasks, a conversation id for agent-created ones.
  author: nullable(textField()),
  droppedAt: nullable(dateField()),
  heldAt: nullable(dateField()),
  rank: rankField(),
  createdAt: dateField(),
  updatedAt: dateField(),
} satisfies FieldsRecord;

export const attemptFields = {
  id: textField(),
  taskId: textField(),
  worktreePath: textField(),
  createdAt: dateField(),
  updatedAt: dateField(),
} satisfies FieldsRecord;

export const taskDependencyFields = {
  taskId: textField(),
  dependsOnTaskId: textField(),
  createdAt: dateField(),
} satisfies FieldsRecord;

export const pushFields = {
  id: textField(),
  attemptId: textField(),
  // Soft attribution to the conversation that ran the push (no FK).
  conversationId: nullable(textField()),
  sha: textField(),
  pushId: textField(),
  message: textField(),
  createdAt: dateField(),
} satisfies FieldsRecord;

export const conversationFields = {
  id: textField(),
  attemptId: textField(),
  title: nullable(textField()),
  // Narrowed text columns: the DDL stays plain `text`, and the field's own
  // schema is what decodes it (the `text` storage arm), so the union in the
  // value type is derived rather than asserted.
  status: enumTextField(ConversationStatusSchema.options),
  runtime: textField(),
  // TOLERANT on purpose, unlike its siblings. Model ids get renamed and rows
  // outlive the rename: a live row still holds the pre-versioning `"opus"`,
  // which is a LEGACY_ALIASES key and NOT in `ConversationModelSchema.options`.
  // A strict decoder here would throw on reading that row. `StoredModelSchema`
  // normalizes it and fires the deduped corruption report — the same guard the
  // live-state resource already carried, moved down to the column so it reaches
  // the server-side readers too.
  //
  // `DEFAULT_MODEL` is now the wire/backfill default, where the tuple form
  // silently gave `"fable-5"` — the first entry of the enum, i.e. tuple order
  // rather than anyone's decision. Nothing observable changes: the column is
  // notNull with no DB default, so every row carries a model and the wire
  // schema's `.default()` never fires. The general factory just makes the value
  // something someone had to choose.
  model: parsedTextField(StoredModelSchema, { default: DEFAULT_MODEL }),
  kind: enumTextField(["user", "agent", "system"] as const),
  claudeSessionId: nullable(textField()),
  waitingFor: nullable(textField()),
  spawnedBy: nullable(textField()),
  createdAt: dateField(),
  updatedAt: dateField(),
  endedAt: nullable(dateField()),
  closeRequested: boolField(),
  // Hibernation lifecycle (orthogonal to `status`).
  hibernatedAt: nullable(dateField()),
  lastViewedAt: nullable(dateField()),
} satisfies FieldsRecord;
