import { and, asc, desc, eq, inArray, ne } from "drizzle-orm";
import { z } from "zod";
import { db } from "@plugins/database/server";
import { defineResource } from "@plugins/framework/plugins/server-core/core";
import {
  compileEdges,
  queryResource,
  rel,
} from "@plugins/infra/plugins/query-resource/server";
import {
  serveCollection,
  serveValue,
} from "@plugins/network/plugins/live/server";
import { withRank } from "@plugins/primitives/plugins/rank/server";
import { _attempts, _conversations, pushes } from "./tables";
import { attempts, conversations, tasks } from "./views";
import { PushSchema, type TaskListItem } from "./schema";
// `key` / `schema` / keyed-ness come from the shared client descriptors — the
// single source of truth both runtimes read. The server adds only the DB half
// (loader + cascade), so these keyed contracts can't drift from the client.
// The two plain values (`taskDetail`, `conversationsGoneStats`) are `liveValue`
// declarations served with `serveValue`, and the `pushRows` collection is
// served with `serveCollection` — both read key / schema / params off the
// declaration itself.
import {
  tasksResource as tasksDescriptor,
  taskDetail,
  attemptsResource as attemptsDescriptor,
  pushRows,
  conversationsActiveResource as conversationsActiveDescriptor,
  conversationsSystemResource as conversationsSystemDescriptor,
  conversationsGoneResource as conversationsGoneDescriptor,
  conversationsGoneStats,
  RECENT_GONE_LIMIT,
} from "../../core";
import type {
  ConversationSummary,
  AttemptWithConversations,
  Conversation,
} from "../../core";
import {
  conversationCascadeSignatures,
  countGoneConversations,
  listConversationSummariesByAttempt,
  listGoneConversations,
} from "./queries/conversations";
import { listPushes } from "./queries/pushes";

// The old aggregate `conversationsLiveResource` is decomposed into four keyed
// delta-sync sub-resources (+ one scalar stats resource). A single conversation
// status change now ships ONE keyed-delta upsert on `conversations-active`
// instead of re-shipping the whole list to every subscriber.
//
// The active/system scans are fully declarative via `queryResource`: the compiler
// derives the FULL loader, the Layer-2 scoped refill (`WHERE id IN (…)`), the
// `identityTable: "conversations"` scope policy (from the conversations_v view
// identity), and the client keyField — replacing the former hand-written loaders.
//
// `scopedMembership: true` (M5) is what makes the mutable-`where` sound here: the
// filter reads `active` (flipped false when a conversation ends), a MUTABLE column.
// Pre-M5 that mandated `recompute: { full }` (the plain scoped refill never emits
// deletes, so a row leaving the filter would sit stale). With scopedMembership the
// runtime detects a where-flip as a membership EXIT — the refill fails to return a
// requested id — and ships it as a real delete + order, so an ended conversation
// leaves the list incrementally with no whole-list FULL. An INSERT enters via the
// derived `orderOf`; a plain field flip still ships one upsert.
//
// These MUST be defined before `attemptsResource`: the runtime wires a downstream
// edge only if the upstream entry already exists, and attempts depends on the
// active sub-resource below. The active loader's read-set covers the whole
// `conversations` table, so the L4 feed delivers EVERY conversation change here
// scoped to its id — which is why attempts can cascade off this one sub-resource
// alone (the derived edge fires on the delivered affected set, not on whether the
// active-filtered payload changed).
export const conversationsActiveResource = queryResource(
  conversationsActiveDescriptor,
  {
    from: conversations,
    // conversations_v PgView. The identity base table is declared explicitly
    // (matching the View({ view: conversations, identityTable: "conversations" })
    // contribution): it cannot be derived here — this call resolves at module eval,
    // before the boot-time contribution collection that populates identity bases.
    identity: { table: "conversations", pk: conversations.id },
    where: and(
      eq(conversations.active, true),
      ne(conversations.kind, "system"),
    ),
    orderBy: desc(conversations.createdAt),
    scopedMembership: true,
    // Highest fan-out source: one notify cascades to attempts → tasks. The poller
    // can notify multiple times per tick; a fixed-window trailing debounce
    // collapses a tick's status changes into one flush. Source-only — never on the
    // keyed attempts/tasks resources.
    // See research/2026-06-15-global-live-state-cascade-contention.md.
    debounceMs: 250,
  },
);

export const conversationsSystemResource = queryResource(
  conversationsSystemDescriptor,
  {
    from: conversations,
    identity: { table: "conversations", pk: conversations.id },
    where: and(
      eq(conversations.kind, "system"),
      eq(conversations.active, true),
    ),
    orderBy: desc(conversations.createdAt),
    scopedMembership: true,
  },
);

export const conversationsGoneResource = defineResource(
  conversationsGoneDescriptor,
  {
    // Bounded window ordered by endedAt DESC LIMIT 30: one conversation ending
    // changes window MEMBERSHIP (a row enters, the oldest may drop), which a per-id
    // scoped recompute can't express — so it declares the explicit FULL opt-out.
    recompute: {
      kind: "full",
      reason:
        "bounded recent-gone window ordered by endedAt; one conversation ending changes window membership",
    },
    loader: async (): Promise<Conversation[]> =>
      listGoneConversations({ limit: RECENT_GONE_LIMIT }),
  },
);

// The ended-conversation total (the gone window above holds only the newest
// RECENT_GONE_LIMIT). A db value: its read-set is `conversations_v`, so every
// conversation write recomputes it, and push mode drops the identical results.
export const conversationsGoneStatsServed = serveValue(conversationsGoneStats, {
  source: "db",
  loader: async () => ({ totalGoneCount: await countGoneConversations() }),
});

// The `pushes` collection (declared in core as `pushRows`): its window —
// filterable by `attemptId`, newest first — and its `:rows` point sibling, over
// the `pushes` table (all seven columns are row fields, so every one is on the
// wire). A push change reaches each subscribed attempt window through window
// membership — at most one bounded ids query per tuple — and
// `pushes_attempt_id_idx` backs the per-attempt read.
export const pushRowsServed = serveCollection(pushRows, { from: pushes });

// Server-only push-mode carrier for the tree's `attempts` status edge below
// (`rel(pushesAttemptsCascade, …)`), which maps changed push ids to their
// attempt ids and needs a loader that reads the whole table. No web
// subscriber and no client declaration — every push surface reads the
// `pushRows` collection above, which is also the edge's future anchor
// (Resources page item 3, when the tree migrates). Not preloaded ⇒ no L2
// persist and no boot payload.
//
// commits-graph used to be the other downstream, and the reason this stayed
// param-less: its `map` was value-aware. It no longer subscribes — its landed set
// is measured from git via `tasks/attempt-work` rather than read off this ledger
// (research/2026-08-17-global-attempt-work-git-derived-standing.md) — so the only
// remaining consumer is the attempts edge.
//
// An attempt's DERIVED STATUS still comes from `attempt_push_agg`, and that is
// now sound rather than a known gap: `pushes` is a projection of `main` (I5, see
// ../push-ledger/), re-derived in-process the instant the ref advances and
// guaranteed on read, so `attempts_v.status` no longer depends on a background
// job's liveness.
export const pushesAttemptsCascade = defineResource({
  key: "pushes.attempts-cascade",
  mode: "push",
  schema: z.array(PushSchema),
  loader: listPushes,
});

export const attemptsResource = defineResource(attemptsDescriptor, {
  // A direct `attempts` change scopes to that attempt id; conversation and push
  // changes arrive scoped through the derived edges below (conv → attempt, push
  // → attempt). The nested conversations loader stays hand-written; only the
  // cascade scoping is derived (`rel()` + `compileEdges`) — no hand-rolled
  // affectedMap closures that can drift from what the loader reads.
  identityTable: "attempts",
  fanOut: {
    reason:
      "param-less: the whole collection is one tuple ({}), so there is no second tuple to narrow away — the scoped refill already limits the READ to the changed attempt ids",
  },
  dependsOn: compileEdges([
    // Cascades off the active sub-resource ALONE. This is sufficient because the
    // active loader's read-set covers the whole `conversations` table, so the L4
    // feed delivers every conversation change here scoped to its id (even
    // gone-only rows the active filter excludes), and the derived edge fires on
    // that delivered affected set — not on whether the payload changed.
    //
    // A changed conversation affects exactly its owning attempt: map the changed
    // conversation ids → their attempt ids via the `_conversations` BASE table
    // (carries attemptId; index conversations_attempt_id_status_idx). This hop
    // reads the base table where the old closure read conversations_v — an
    // FK-equivalent attemptId set (conversations_v inner-joins attempts, but the
    // NOT NULL attempt FK guarantees the same set), verified by the parity diff.
    //
    // `signature` (relevance gate): a conversation write that touched ONLY
    // transient fields (waitingFor/updatedAt/lastViewedAt — none of which an
    // attempt derives) never reaches this edge's affectedMap, so it can't cascade
    // a no-op recompute through attempts → tasks. Genuine status/title/liveness
    // changes still flow through (they're in the signature).
    rel(
      conversationsActiveResource,
      {
        via: _conversations,
        from: _conversations.id,
        to: _conversations.attemptId,
      },
      { signature: conversationCascadeSignatures },
    ),
    // Push changes flip an attempt's derived status (in_progress → pushed /
    // completed) and finished_at. Previously `attempts_v` referenced `pushes`
    // directly, so a push change routed to it through the view→base-table graph;
    // now `attempts_v` reads the `attempt_push_agg` rollup (feed-exempt, no NOTIFY),
    // so this explicit edge carries the invalidation. `pushesAttemptsCascade`'s
    // loader reads the whole `pushes` table, so the L4 feed delivers every push
    // change here scoped to its id; the hop maps push ids → their attempt ids.
    rel(pushesAttemptsCascade, {
      via: pushes,
      from: pushes.id,
      to: pushes.attemptId,
    }),
  ]),
  loader: async (_params, ctx): Promise<AttemptWithConversations[]> => {
    const ids = ctx?.affectedIds;
    const [attemptRows, convRows] = await Promise.all([
      ids
        ? db
            .select()
            .from(attempts)
            .where(inArray(attempts.id, [...ids]))
            .orderBy(asc(attempts.createdAt))
        : db.select().from(attempts).orderBy(asc(attempts.createdAt)),
      listConversationSummariesByAttempt(ids),
    ]);
    const byAttempt = new Map<string, ConversationSummary[]>();
    for (const c of convRows) {
      const summary: ConversationSummary = {
        id: c.id,
        title: c.title,
        status: c.status,
        kind: c.kind,
        createdAt: c.createdAt,
        spawnedBy: c.spawnedBy,
      };
      const list = byAttempt.get(c.attemptId);
      if (list) list.push(summary);
      else byAttempt.set(c.attemptId, [summary]);
    }
    return attemptRows.map((a) => ({
      ...a,
      conversations: byAttempt.get(a.id) ?? [],
    }));
  },
});

// List payload: every `tasks_v` column EXCEPT `description`. Pushed to every tab
// on each cascade fire, so it carries only what the list renders — dropping
// `description` removes ~60% of the payload. The detail pane reads the full row
// (incl. description) from the `taskDetail` value below.
//
// Fully declarative via `queryResource`: the compiler derives the FULL loader,
// the Layer-2 scoped refill (`WHERE id IN (…)`), the `identityTable: "tasks"`
// scope policy (from the tasks_v view identity), the derived cascade edge, and
// the client keyField — replacing the former hand-written loader + affectedMap
// closure + `as unknown as` cast.
export const tasksResource = queryResource(tasksDescriptor, {
  // tasks_v PgView. The identity base table is declared explicitly (matching the
  // View({ view: tasks, identityTable: "tasks" }) contribution in server/index.ts):
  // it cannot be derived here — this call resolves at module eval, before the
  // boot-time contribution collection that populates relationIdentityBase.
  from: tasks,
  identity: { table: "tasks", pk: tasks.id },
  // Every `tasks_v` column except `description`. The `satisfies Record<keyof
  // TaskListItem, unknown>` makes this projection fail to COMPILE if it ever
  // drifts from `TaskListItemSchema` (= `TaskSchema.omit({ description })`):
  // adding a `_tasks` column makes it required in the schema, so omitting it here
  // is a type error. Previously the column set was hand-listed with no such guard
  // and an `as unknown as` cast that hid the mismatch — a missing column (e.g.
  // `titleAuto`) surfaced only at runtime as a ZodError on every list load,
  // freezing the whole tasks app.
  select: {
    id: tasks.id,
    folderId: tasks.folderId,
    groupId: tasks.groupId,
    clusterId: tasks.clusterId,
    title: tasks.title,
    titleAuto: tasks.titleAuto,
    author: tasks.author,
    droppedAt: tasks.droppedAt,
    heldAt: tasks.heldAt,
    rank: tasks.rank,
    createdAt: tasks.createdAt,
    updatedAt: tasks.updatedAt,
    status: tasks.status,
    active: tasks.active,
    finishedAt: tasks.finishedAt,
    dependencies: tasks.dependencies,
  } satisfies Record<keyof TaskListItem, unknown>,
  orderBy: [asc(tasks.rank), asc(tasks.createdAt)],
  // A direct `tasks` change scopes to that task id (identityTable); attempt (and,
  // transitively, conversation) changes arrive scoped through this derived edge.
  // A changed attempt affects exactly its owning task: map changed attempt ids →
  // their task ids via the `_attempts` BASE table (carries taskId; index
  // attempts_task_id_idx). Reads the base table where the old closure read
  // attempts_v — an FK-equivalent taskId set (attempts_v is _attempts + computed
  // columns; taskId is a base column), verified by the parity diff.
  edges: [
    rel(attemptsResource, {
      via: _attempts,
      from: _attempts.id,
      to: _attempts.taskId,
    }),
  ],
});

// Per-id detail value: the full task row (incl. `description`), or `null` when
// no such task exists. Only loads for an open detail pane (params `{ id }`) and
// re-pushes when what it read changes — so the bulk list stays lean while the
// description editor remains live across tabs/agents. The list resource stays
// authoritative for derived fields (status/finishedAt); this exists to supply
// `description`. A db value over one row (not an array), so no `unbounded`.
export const taskDetailServed = serveValue(taskDetail, {
  source: "db",
  loader: async ({ id }) => {
    const [row] = await db
      .select()
      .from(tasks)
      .where(eq(tasks.id, id))
      .limit(1);
    return row ? withRank(row) : null;
  },
});
