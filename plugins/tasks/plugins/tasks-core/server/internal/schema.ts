import { createSelectSchema } from "drizzle-zod";
import { z } from "zod";
import { _attempts, _conversations, _tasks, pushes } from "./tables";
import { StoredModelSchema } from "@plugins/conversations/plugins/model-provider/core";
import { RankSchema } from "@plugins/primitives/plugins/rank/core";
import { ConversationStatusSchema } from "../../core/conversation-status";

// Zod schemas + types for the tasks / attempts / conversations cluster. The
// derived pgView relations (attempts_v / tasks_v / conversations_v) live in
// `./views.ts`, kept out of the drizzle codegen glob; the schemas below describe
// those view row shapes for the live-state resources.

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

export const TaskSchema = createSelectSchema(_tasks, {
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
  droppedAt: z.coerce.date().nullable(),
  heldAt: z.coerce.date().nullable(),
  rank: RankSchema,
}).extend({
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

export const AttemptSchema = createSelectSchema(_attempts, {
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
}).extend({
  status: AttemptStatusSchema,
  active: z.boolean(),
  finishedAt: z.coerce.date().nullable(),
});
export type Attempt = z.infer<typeof AttemptSchema>;

export const PushSchema = createSelectSchema(pushes, {
  createdAt: z.coerce.date(),
});
export type Push = z.infer<typeof PushSchema>;

export const ConversationSchema = createSelectSchema(_conversations, {
  status: ConversationStatusSchema,
  // Tolerant by construction (see StoredModelSchema): a legacy/unknown stored
  // model (e.g. written by a concurrent worktree on pre-flatten code, or an id
  // later removed from the registry) normalizes to a concrete model instead of
  // rejecting the row — which would blank the whole conversationsResource array.
  model: StoredModelSchema,
  kind: ConversationKindSchema,
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
  endedAt: z.coerce.date().nullable(),
}).extend({
  worktreePath: z.string(),
  taskId: z.string(),
  active: z.boolean(),
});
export type Conversation = z.infer<typeof ConversationSchema>;
