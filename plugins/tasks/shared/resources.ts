// In-plugin imports go straight to the leaf so the frontend bundle doesn't
// pull `server/api`'s runtime surface. Cross-plugin consumers go through
// `@plugins/tasks-core/server`.
import type {
  AttemptWithConversations,
  Push,
  Task,
} from "@plugins/tasks-core/shared";
import {
  TaskSchema,
  AttemptWithConversationsSchema,
  PushSchema,
} from "@plugins/tasks-core/shared";
import { resourceDescriptor } from "@plugins/primitives/plugins/live-state/shared";
import { z } from "zod";

export type {
  Attempt,
  AttemptWithConversations,
  ConversationSummary,
  Push,
  Task,
} from "@plugins/tasks-core/shared";

export const tasksResource = resourceDescriptor<Task[]>("tasks", z.array(TaskSchema));
export const attemptsResource = resourceDescriptor<AttemptWithConversations[]>("attempts", z.array(AttemptWithConversationsSchema));
export const pushesResource = resourceDescriptor<Push[]>("pushes", z.array(PushSchema));
