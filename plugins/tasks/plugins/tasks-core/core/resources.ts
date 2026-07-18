import {
  resourceDescriptor,
  keyedResourceDescriptor,
} from "@plugins/primitives/plugins/live-state/core";
import { queryResourceDescriptor } from "@plugins/infra/plugins/query-resource/core";
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
// The tasks list is fully declarative: its server half is a `queryResource`
// (derived loader + scoped refill + identityTable + derived cascade edge), so
// the descriptor is a `queryResourceDescriptor` — a keyed `ResourceDescriptor`
// over `TaskListItem[]` plus the `queryPk` the server asserts its derived
// keyField against (a boot-time throw on drift). Web consumers still read only
// key/origin/schema/keyOf, so the swap is additive.
export const tasksResource = queryResourceDescriptor<TaskListItem>(
  "tasks",
  TaskListItemSchema,
  "id",
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
// Global push resource — a param-less push-mode carrier whose ONLY role now is
// the SERVER cascade: the `attempts` status invalidation (`rel(pushesResource,…)`,
// id-based) and the commits-graph refresh (a value-aware `map` reading the whole
// pushes value). No web consumer subscribes anymore — every attempt-scoped push
// surface reads the bounded `pushesByAttemptResource` below instead. It is NOT
// bootCritical: nothing subscribes, so persisting/boot-shipping the full table
// (the measured 525 KB churn) is pure waste. A window here is impossible — a
// value-aware `map` downstream forces the loader to run on every change, and the
// zero-subscriber cascade fans to the param-less `{}` tuple, which a windowed
// loader cannot decode.
export const pushesResource = resourceDescriptor<Push[]>(
  "pushes",
  z.array(PushSchema),
  [],
);

// Per-attempt bounded push list — a keyed resource parametrized by `{ attemptId }`
// so each consumer subscribes to exactly ONE attempt's pushes, bounded by that
// attempt and CORRECT for arbitrarily old attempts. This is the source every
// attempt-scoped push consumer reads: filtering the global `pushes` window by
// attemptId silently dropped an old attempt's pushes once they fell outside the
// recent global window (a wrong "No pushes yet" / a destructive drop-vs-complete
// mis-gate). NOT bootCritical — route-scoped, hydrates post-mount via its sub-ack
// (the page-block-doc precedent). The server half is a hand-written keyed
// `defineResource` with `identityTable: "pushes"`.
export const pushesByAttemptResource = keyedResourceDescriptor<
  Push[],
  { attemptId: string }
>("pushes-by-attempt", z.array(PushSchema), [], (r) => (r as Push).id);

// Conversation list, decomposed into keyed delta-sync sub-resources + one scalar
// stats resource (replaces the old aggregate `conversationsResource`). Keyed
// resources read like push resources via `useResource` (the delta-merge is
// invisible to consumers); the client recombines them through use-conversations.
//
// The active/system scans are fully declarative: their server halves are
// `queryResource`s (derived loader + scoped refill + identityTable + M5
// scopedMembership), so their descriptors are `queryResourceDescriptor`s — a keyed
// `ResourceDescriptor` over `Conversation[]` plus the `queryPk` the server asserts
// its derived keyField against (a boot-time throw on drift). Web consumers still
// read only key/origin/schema/keyOf, so the swap is additive (mirrors the
// `tasksResource` precedent above).
export const conversationsActiveResource = queryResourceDescriptor<Conversation>(
  "conversations-active",
  ConversationSchema,
  "id",
  { bootCritical: true },
);
export const conversationsSystemResource = queryResourceDescriptor<Conversation>(
  "conversations-system",
  ConversationSchema,
  "id",
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
