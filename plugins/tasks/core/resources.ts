// In-plugin imports go straight to the leaf so the frontend bundle doesn't
// pull `server/api`'s runtime surface. Cross-plugin consumers go through
// `@plugins/tasks-core/server`.
import type {
  AttemptWithConversations,
  Push,
  Task,
  TaskListItem,
} from "@plugins/tasks-core/core";
import {
  TaskSchema,
  TaskListItemSchema,
  AttemptWithConversationsSchema,
  PushSchema,
} from "@plugins/tasks-core/core";
import { resourceDescriptor } from "@plugins/primitives/plugins/live-state/core";
import { z } from "zod";

export type {
  Attempt,
  AttemptWithConversations,
  ConversationSummary,
  Push,
  Task,
  TaskListItem,
} from "@plugins/tasks-core/core";

// Bulk list: lean per-row projection (no `description`). The detail pane reads
// the full task from `taskDetailResource`, keyed by id.
export const tasksResource = resourceDescriptor<TaskListItem[]>("tasks", z.array(TaskListItemSchema), []);
export const taskDetailResource = resourceDescriptor<Task | null, { id: string }>(
  "task-detail",
  TaskSchema.nullable(),
  null,
);
export const attemptsResource = resourceDescriptor<AttemptWithConversations[]>("attempts", z.array(AttemptWithConversationsSchema), []);
export const pushesResource = resourceDescriptor<Push[]>("pushes", z.array(PushSchema), []);
