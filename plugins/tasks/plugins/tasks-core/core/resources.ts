import {
  resourceDescriptor,
  keyedResourceDescriptor,
} from "@plugins/primitives/plugins/live-state/core";
import { z } from "zod";
import {
  TaskSchema,
  TaskListItemSchema,
  PushSchema,
  ConversationSchema,
  type Task,
  type TaskListItem,
  type Push,
  type Conversation,
} from "./internal/schema";
import { AttemptWithConversationsSchema, type AttemptWithConversations } from "./schemas";

// Recent-gone window size (rows shown before "show more"). Lives in core so the
// web can derive `hasMoreGone = totalGoneCount > RECENT_GONE_LIMIT`; the server
// queries import it back (core has no server deps, so no cycle).
export const RECENT_GONE_LIMIT = 30;

// Client/shared live-state descriptors for the tasks/attempts FK cluster. THE
// single source of truth for each resource's key / schema / keyed-ness: the
// tasks-core *server* resources are built from these via
// `defineResource(descriptor, serverOpts)`, so the server cannot drift from the
// client (a server `mode: "keyed"` against a client descriptor that forgot its
// `keyOf` is a guaranteed client crash with no compile-time signal).
//
// They live in `tasks-core/core` — next to the schemas they build on — rather
// than in the `tasks` umbrella, so the tasks-core server
// can import them without forming a `tasks ⇄ tasks-core` plugin cycle. Consumers
// import these directly from `@plugins/tasks/plugins/tasks-core/core`.
export const tasksResource = keyedResourceDescriptor<TaskListItem[]>(
  "tasks",
  z.array(TaskListItemSchema),
  [],
  (r) => (r as TaskListItem).id,
  { bootCritical: true },
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
  { bootCritical: true },
);
export const pushesResource = resourceDescriptor<Push[]>("pushes", z.array(PushSchema), [], {
  bootCritical: true,
});

// Conversation list, decomposed into keyed delta-sync sub-resources + one scalar
// stats resource (replaces the old aggregate `conversationsResource`). Keyed
// resources read like push resources via `useResource` (the delta-merge is
// invisible to consumers); the client recombines them through use-conversations.
export const conversationsActiveResource = keyedResourceDescriptor<Conversation[]>(
  "conversations-active",
  z.array(ConversationSchema),
  [],
  (r) => (r as Conversation).id,
  { bootCritical: true },
);
export const conversationsSystemResource = keyedResourceDescriptor<Conversation[]>(
  "conversations-system",
  z.array(ConversationSchema),
  [],
  (r) => (r as Conversation).id,
  { bootCritical: true },
);
export const conversationsGoneResource = keyedResourceDescriptor<Conversation[]>(
  "conversations-gone",
  z.array(ConversationSchema),
  [],
  (r) => (r as Conversation).id,
  { bootCritical: true },
);
export const conversationsGoneStatsResource = resourceDescriptor<{ totalGoneCount: number }>(
  "conversations-gone-stats",
  z.object({ totalGoneCount: z.number() }),
  { totalGoneCount: 0 },
  { bootCritical: true },
);
