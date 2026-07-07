import { and, asc, desc, eq, inArray, ne } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { defineResource } from "@plugins/framework/plugins/server-core/core";
import {
  compileEdges,
  queryResource,
  rel,
} from "@plugins/infra/plugins/query-resource/server";
import { _attempts, _conversations, pushes } from "./tables";
import { attempts, conversations, tasks } from "./views";
import type { Task, TaskListItem } from "./schema";
// `key` / `schema` / keyed-ness come from the shared client descriptors — the
// single source of truth both runtimes read. The server adds only the DB half
// (loader + cascade), so these keyed contracts can't drift from the client.
import {
  tasksResource as tasksDescriptor,
  taskDetailResource as taskDetailDescriptor,
  attemptsResource as attemptsDescriptor,
  pushesResource as pushesDescriptor,
  conversationsActiveResource as conversationsActiveDescriptor,
  conversationsSystemResource as conversationsSystemDescriptor,
  conversationsGoneResource as conversationsGoneDescriptor,
  conversationsGoneStatsResource as conversationsGoneStatsDescriptor,
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
export const conversationsActiveResource = queryResource(conversationsActiveDescriptor, {
  from: conversations,
  // conversations_v PgView. The identity base table is declared explicitly
  // (matching the View({ view: conversations, identityTable: "conversations" })
  // contribution): it cannot be derived here — this call resolves at module eval,
  // before the boot-time contribution collection that populates identity bases.
  identity: { table: "conversations", pk: conversations.id },
  where: and(eq(conversations.active, true), ne(conversations.kind, "system")),
  orderBy: desc(conversations.createdAt),
  scopedMembership: true,
  // Highest fan-out source: one notify cascades to attempts → tasks. The poller
  // can notify multiple times per tick; a fixed-window trailing debounce
  // collapses a tick's status changes into one flush. Source-only — never on the
  // keyed attempts/tasks resources.
  // See research/2026-06-15-global-live-state-cascade-contention.md.
  debounceMs: 250,
});

export const conversationsSystemResource = queryResource(conversationsSystemDescriptor, {
  from: conversations,
  identity: { table: "conversations", pk: conversations.id },
  where: and(eq(conversations.kind, "system"), eq(conversations.active, true)),
  orderBy: desc(conversations.createdAt),
  scopedMembership: true,
});

export const conversationsGoneResource = defineResource(conversationsGoneDescriptor, {
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
});

export const conversationsGoneStatsResource = defineResource(conversationsGoneStatsDescriptor, {
  mode: "push",
  loader: async () => ({ totalGoneCount: await countGoneConversations() }),
});

export const pushesResource = defineResource(pushesDescriptor, {
  mode: "push",
  loader: async () =>
    db.select().from(pushes).orderBy(desc(pushes.createdAt)),
});

export const attemptsResource = defineResource(attemptsDescriptor, {
  // A direct `attempts` change scopes to that attempt id; conversation and push
  // changes arrive scoped through the derived edges below (conv → attempt, push
  // → attempt). The nested conversations loader stays hand-written; only the
  // cascade scoping is derived (`rel()` + `compileEdges`) — no hand-rolled
  // affectedMap closures that can drift from what the loader reads.
  identityTable: "attempts",
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
      { via: _conversations, from: _conversations.id, to: _conversations.attemptId },
      { signature: conversationCascadeSignatures },
    ),
    // Push changes flip an attempt's derived status (in_progress → pushed /
    // completed) and finished_at. Previously `attempts_v` referenced `pushes`
    // directly, so a push change routed to it through the view→base-table graph;
    // now `attempts_v` reads the `attempt_push_agg` rollup (feed-exempt, no NOTIFY),
    // so this explicit edge carries the invalidation. `pushesResource`'s loader
    // reads the whole `pushes` table, so the L4 feed delivers every push change
    // here scoped to its id; the hop maps push ids → their attempt ids.
    rel(pushesResource, { via: pushes, from: pushes.id, to: pushes.attemptId }),
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
// (incl. description) from `taskDetailResource` below.
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
    title: tasks.title,
    titleAuto: tasks.titleAuto,
    author: tasks.author,
    droppedAt: tasks.droppedAt,
    heldAt: tasks.heldAt,
    expanded: tasks.expanded,
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
  edges: [rel(attemptsResource, { via: _attempts, from: _attempts.id, to: _attempts.taskId })],
});

// Per-id detail resource: the full task row (incl. `description`). Only loads
// for an open detail pane (parametrized by id) and re-pushes when that one task
// is mutated — so the bulk list stays lean while the description editor remains
// live across tabs/agents. The list resource stays authoritative for derived
// fields (status/finishedAt); this exists to supply `description`.
export const taskDetailResource = defineResource(taskDetailDescriptor, {
  mode: "push",
  loader: async ({ id }) => {
    const [row] = await db.select().from(tasks).where(eq(tasks.id, id)).limit(1);
    return (row as unknown as Task | undefined) ?? null;
  },
});
