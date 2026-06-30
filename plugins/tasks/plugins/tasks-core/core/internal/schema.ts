import { z } from "zod";
import { fieldsToZodObject } from "@plugins/fields/core";
import { StoredModelSchema } from "@plugins/conversations/plugins/model-provider/core";
import { RankSchema } from "@plugins/primitives/plugins/rank/core";
import { ConversationStatusSchema } from "../conversation-status";
import {
  taskFields,
  attemptFields,
  pushFields,
  conversationFields,
} from "./fields";

// Public Zod schemas + types for the tasks / attempts / conversations cluster.
//
// The BASE row columns are derived from the per-table field records (the single
// source of truth shared with the physical `defineEntity` tables in
// `server/internal/tables.ts`, so wire ↔ column drift is unrepresentable). On
// top of the base rows, `.extend(...)` layers:
//   - the computed *view* columns the derived pgViews add (`status`, `active`,
//     `finishedAt`, `dependencies`, `worktreePath`, `taskId`); and
//   - the transform overrides (`rank` → the `Rank` value object, `model` → the
//     tolerant `StoredModelSchema`, the enum-branded `status` / `kind`).
//
// These schemas describe the VIEW row shapes the live-state resources publish —
// richer than the base table row — so they intentionally differ from
// `entity.schema`. Lives in `core/` (web-safe) so the browser can evaluate them
// without reaching into the server-only `defineEntity` path.

export const TaskStatusSchema = z.enum([
  "new",
  "in_progress",
  "need_action",
  "attempted",
  "done",
  "held",
  "dropped",
  "blocked",
]);
export type TaskStatus = z.infer<typeof TaskStatusSchema>;

export const AttemptStatusSchema = z.enum([
  "pending",
  "in_progress",
  "pushed",
  "completed",
  "abandoned",
]);
export type AttemptStatus = z.infer<typeof AttemptStatusSchema>;

export const ConversationKindSchema = z.enum(["user", "agent", "system"]);
export type ConversationKind = z.infer<typeof ConversationKindSchema>;

export const TaskSchema = fieldsToZodObject(taskFields).extend({
  rank: RankSchema,
  status: TaskStatusSchema,
  active: z.boolean(),
  finishedAt: z.coerce.date().nullable(),
  dependencies: z.array(z.string()),
});
export type Task = z.infer<typeof TaskSchema>;

// List-view projection: the full task minus the heavy `description` text column
// (~60% of the bulk `tasks` live-state payload). The list never renders
// descriptions; the detail pane sources them from the per-id `task-detail`
// resource. Keeping this a distinct type makes any list consumer that reaches
// for `description` fail to compile. See
// research/2026-06-05-tasks-list-detail-payload-split.md.
export const TaskListItemSchema = TaskSchema.omit({ description: true });
export type TaskListItem = z.infer<typeof TaskListItemSchema>;

export const AttemptSchema = fieldsToZodObject(attemptFields).extend({
  status: AttemptStatusSchema,
  active: z.boolean(),
  finishedAt: z.coerce.date().nullable(),
});
export type Attempt = z.infer<typeof AttemptSchema>;

export const PushSchema = fieldsToZodObject(pushFields);
export type Push = z.infer<typeof PushSchema>;

export const ConversationSchema = fieldsToZodObject(conversationFields).extend({
  status: ConversationStatusSchema,
  // Tolerant by construction (see StoredModelSchema): a legacy/unknown stored
  // model (e.g. written by a concurrent worktree on pre-flatten code, or an id
  // later removed from the registry) normalizes to a concrete model instead of
  // rejecting the row — which would blank a whole conversations sub-resource array.
  model: StoredModelSchema,
  kind: ConversationKindSchema,
  worktreePath: z.string(),
  taskId: z.string(),
  active: z.boolean(),
});
export type Conversation = z.infer<typeof ConversationSchema>;
