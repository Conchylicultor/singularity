// In-plugin imports go straight to the leaf so the frontend bundle doesn't
// pull `server/api`'s runtime surface. Cross-plugin consumers go through
// `@plugins/tasks-core/server`.
import type {
  AttemptWithConversations,
  Push,
  Task,
} from "@plugins/tasks-core/shared";
import { resourceDescriptor } from "@core/shared/resource";

export type {
  Attempt,
  AttemptWithConversations,
  ConversationSummary,
  Push,
  Task,
} from "@plugins/tasks-core/shared";

export const tasksResource = resourceDescriptor<Task[]>("tasks");
export const attemptsResource = resourceDescriptor<AttemptWithConversations[]>("attempts");
export const pushesResource = resourceDescriptor<Push[]>("pushes");
