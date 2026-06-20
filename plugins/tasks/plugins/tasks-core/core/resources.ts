import {
  resourceDescriptor,
  keyedResourceDescriptor,
} from "@plugins/primitives/plugins/live-state/core";
import { z } from "zod";
import {
  TaskSchema,
  TaskListItemSchema,
  PushSchema,
  type Task,
  type TaskListItem,
  type Push,
} from "../server/internal/schema";
import { AttemptWithConversationsSchema, type AttemptWithConversations } from "./schemas";

// Client/shared live-state descriptors for the tasks/attempts FK cluster. THE
// single source of truth for each resource's key / schema / keyed-ness: the
// tasks-core *server* resources are built from these via
// `defineResource(descriptor, serverOpts)`, so the server cannot drift from the
// client (a server `mode: "keyed"` against a client descriptor that forgot its
// `keyOf` is a guaranteed client crash with no compile-time signal).
//
// They live in `tasks-core/core` — next to the schemas and `conversationsResource`
// they build on — rather than in the `tasks` umbrella, so the tasks-core server
// can import them without forming a `tasks ⇄ tasks-core` plugin cycle. Consumers
// import these directly from `@plugins/tasks/plugins/tasks-core/core`.
export const tasksResource = keyedResourceDescriptor<TaskListItem[]>(
  "tasks",
  z.array(TaskListItemSchema),
  [],
  (r) => (r as TaskListItem).id,
);
export const taskDetailResource = resourceDescriptor<Task | null, { id: string }>(
  "task-detail",
  TaskSchema.nullable(),
  null,
);
export const attemptsResource = keyedResourceDescriptor<AttemptWithConversations[]>(
  "attempts",
  z.array(AttemptWithConversationsSchema),
  [],
  (r) => (r as AttemptWithConversations).id,
);
export const pushesResource = resourceDescriptor<Push[]>("pushes", z.array(PushSchema), []);
