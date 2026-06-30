import type { FieldsRecord } from "@plugins/fields/core";
import { nullable } from "@plugins/fields/core";
import {
  textField,
  enumTextField,
} from "@plugins/fields/plugins/text/plugins/config/core";
import { boolField } from "@plugins/fields/plugins/bool/plugins/config/core";
import { dateField } from "@plugins/fields/plugins/date/plugins/config/core";
import { rankField } from "@plugins/fields/plugins/rank/plugins/config/core";
import { ConversationModelSchema } from "@plugins/conversations/plugins/model-provider/core";
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
  title: textField(),
  // Whether `title` is a machine-generated label rather than human-authored.
  titleAuto: boolField(),
  description: nullable(textField()),
  // "user" for UI-created tasks, a conversation id for agent-created ones.
  author: nullable(textField()),
  droppedAt: nullable(dateField()),
  heldAt: nullable(dateField()),
  expanded: boolField(),
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
  // Branded text columns (the `$type` brand is TS-only — DDL stays plain text).
  status: enumTextField(ConversationStatusSchema.options),
  runtime: textField(),
  model: enumTextField(ConversationModelSchema.options),
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
