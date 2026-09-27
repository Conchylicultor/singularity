import { keyedResourceDescriptor } from "@plugins/primitives/plugins/live-state/core";
import { queryResourceDescriptor } from "@plugins/infra/plugins/query-resource/core";
import { liveCollection, liveValue } from "@plugins/network/plugins/live/core";
import { liveText } from "@plugins/network/plugins/live/plugins/filter/core";
import { z } from "zod";
import {
  TaskSchema,
  TaskListItemSchema,
  PushSchema,
  ConversationSchema,
  type TaskListItem,
  type Conversation,
} from "./internal/schema";
import {
  AttemptWithConversationsSchema,
  type AttemptWithConversations,
} from "./schemas";

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
  { preload: "boot" },
);
// One task's full row (incl. `description`, which the lean `tasks` list omits),
// per `{ id }`. `null` is a settled answer — no such task — never a stand-in:
// not loaded yet is `pending`. Pushed whole on every change to what its loader
// reads (`tasks_v`); not preloaded (a param'd value has no default tuple — it
// loads for an open detail pane). Served in `../server/internal/resources.ts`.
export const taskDetail = liveValue("task-detail", {
  schema: TaskSchema.nullable(),
  params: ["id"],
});
export const attemptsResource = keyedResourceDescriptor<
  AttemptWithConversations[]
>(
  "attempts",
  z.array(AttemptWithConversationsSchema),
  [],
  (r) => (r as AttemptWithConversations).id,
  { preload: "boot" },
);
// The `pushes` ledger as a live collection: one row per landed commit sha.
// Every push surface is attempt-scoped, so it reads ONE attempt's rows —
// `useLive(pushRows, { where: { attemptId } })` — newest first by default. A
// filter, not a slice of a global recent window, so an arbitrarily old attempt
// still finds its pushes (filtering the global window dropped them once they
// fell out of it: a wrong "No pushes yet", a destructive drop-vs-complete
// mis-gate). An attempt holds a handful of pushes (at most 5 on main), so the
// default 100 never truncates one. Not preloaded — route-scoped.
//
// Named `pushRows` because `pushes` is the table handle on the server. It is
// also the future anchor of the tree's `attempts` status edge (Resources page
// item 3); until then that edge hangs off the server-only
// `pushes.attempts-cascade` carrier in `../server/internal/resources.ts`.
export const pushRows = liveCollection("pushes", {
  row: PushSchema,
  id: "id",
  filterable: { attemptId: liveText() },
  sortable: ["createdAt"],
  default: { orderBy: [["createdAt", "desc"]], limit: 100 },
  maxLimit: 500,
});

// Conversation list, decomposed into keyed delta-sync sub-resources + one scalar
// stats value (`conversationsGoneStats`, below) — replacing the old aggregate
// `conversationsResource`. Keyed resources read like push resources via
// `useResource` (the delta-merge is invisible to consumers); the client
// recombines them through use-conversations.
//
// The active/system scans are fully declarative: their server halves are
// `queryResource`s (derived loader + scoped refill + identityTable + M5
// scopedMembership), so their descriptors are `queryResourceDescriptor`s — a keyed
// `ResourceDescriptor` over `Conversation[]` plus the `queryPk` the server asserts
// its derived keyField against (a boot-time throw on drift). Web consumers still
// read only key/origin/schema/keyOf, so the swap is additive (mirrors the
// `tasksResource` precedent above).
export const conversationsActiveResource =
  queryResourceDescriptor<Conversation>(
    "conversations-active",
    ConversationSchema,
    "id",
    { preload: "boot" },
  );
export const conversationsSystemResource =
  queryResourceDescriptor<Conversation>(
    "conversations-system",
    ConversationSchema,
    "id",
    { preload: "boot" },
  );
export const conversationsGoneResource = keyedResourceDescriptor<
  Conversation[]
>(
  "conversations-gone",
  z.array(ConversationSchema),
  [],
  (r) => (r as Conversation).id,
  { preload: "boot" },
);
// How many conversations have ended in all — the gone list above holds only the
// newest RECENT_GONE_LIMIT. One scalar, pushed whole. `preload: "boot"`: the
// boot snapshot hydrates it (and L2 persists it) alongside the lists it
// completes, so the welcome counts paint settled.
export const conversationsGoneStats = liveValue("conversations-gone-stats", {
  schema: z.object({ totalGoneCount: z.number() }),
  preload: "boot",
});
