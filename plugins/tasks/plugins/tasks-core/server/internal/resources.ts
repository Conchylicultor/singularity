import { asc, desc, eq, inArray } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { defineResource } from "@plugins/framework/plugins/server-core/core";
import { pushes } from "./tables";
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
  listActiveConversations,
  listActiveSystemConversations,
  listConversationSummariesByAttempt,
  listGoneConversations,
} from "./queries/conversations";

// The old aggregate `conversationsLiveResource` is decomposed into four keyed
// delta-sync sub-resources (+ one scalar stats resource). A single conversation
// status change now ships ONE keyed-delta upsert on `conversations-active`
// instead of re-shipping the whole list to every subscriber.
//
// These MUST be defined before `attemptsResource`: the runtime wires a downstream
// edge only if the upstream entry already exists, and attempts depends on the
// active sub-resource below.
export const conversationsActiveResource = defineResource(conversationsActiveDescriptor, {
  // The loader reads the whole `conversations` table, so the L4 feed delivers
  // EVERY conversation UPDATE here scoped to its id (read-sets are table-level) —
  // which is why attempts can cascade off this one sub-resource alone: the
  // delivered affected set drives the downstream edge regardless of whether this
  // active-filtered payload actually changed.
  identityTable: "conversations",
  // Highest fan-out source: one notify cascades to attempts → tasks. The poller
  // can notify multiple times per tick; a fixed-window trailing debounce
  // collapses a tick's status changes into one flush. Source-only — never on the
  // keyed attempts/tasks resources.
  // See research/2026-06-15-global-live-state-cascade-contention.md.
  debounceMs: 250,
  loader: async (_p, ctx): Promise<Conversation[]> =>
    listActiveConversations(ctx?.affectedIds),
});

export const conversationsSystemResource = defineResource(conversationsSystemDescriptor, {
  identityTable: "conversations",
  loader: async (_p, ctx): Promise<Conversation[]> =>
    listActiveSystemConversations(ctx?.affectedIds),
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
  // changes arrive scoped through the affectedMap edges below (conv → attempt,
  // push → attempt).
  identityTable: "attempts",
  dependsOn: [
    {
      // Cascades off the active sub-resource ALONE. This is sufficient because the
      // active loader's read-set covers the whole `conversations` table, so the L4
      // feed delivers every conversation change here scoped to its id (even
      // gone-only rows the active filter excludes), and the downstream affectedMap
      // edge fires on that delivered affected set — not on whether the payload
      // changed.
      resource: conversationsActiveResource,
      // Relevance gate: a conversation write that touched ONLY transient fields
      // (waitingFor/updatedAt/lastViewedAt — none of which an attempt derives)
      // never reaches this edge's affectedMap, so it can't cascade a no-op
      // recompute through attempts → tasks. Genuine status/title/liveness
      // changes still flow through (they're in the signature).
      signature: conversationCascadeSignatures,
      // A changed conversation affects exactly its owning attempt. Map the
      // changed conversation ids → their attempt ids via the conversations_v
      // view (carries attemptId; index conversations_attempt_id_status_idx).
      affectedMap: async (convIds) => {
        const rows = await db
          .selectDistinct({ attemptId: conversations.attemptId })
          .from(conversations)
          .where(inArray(conversations.id, [...convIds]));
        return rows.map((r) => r.attemptId);
      },
    },
    {
      // Push changes flip an attempt's derived status (in_progress → pushed /
      // completed) and finished_at. Previously `attempts_v` referenced `pushes`
      // directly, so a push change routed to it through the view→base-table graph;
      // now `attempts_v` reads the `attempt_push_agg` rollup (feed-exempt, no NOTIFY),
      // so this explicit edge carries the invalidation. `pushesResource`'s loader
      // reads the whole `pushes` table, so the L4 feed delivers every push change
      // here scoped to its id; the affectedMap maps push ids → their attempt ids.
      resource: pushesResource,
      affectedMap: async (pushIds) => {
        const rows = await db
          .selectDistinct({ attemptId: pushes.attemptId })
          .from(pushes)
          .where(inArray(pushes.id, [...pushIds]));
        return rows.map((r) => r.attemptId);
      },
    },
  ],
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

// List loader: every `tasks_v` column EXCEPT `description`. Pushed to every tab
// on each cascade fire, so it carries only what the list renders — dropping
// `description` removes ~60% of the payload. The detail pane reads the full row
// (incl. description) from `taskDetailResource` below.
export const tasksResource = defineResource(tasksDescriptor, {
  // A direct `tasks` change scopes to that task id; attempt/conversation changes
  // arrive scoped through the affectedMap edge below (attempt → task), which is
  // covered transitively (conv → attempt → task).
  identityTable: "tasks",
  dependsOn: [
    {
      resource: attemptsResource,
      // A changed attempt affects exactly its owning task. Map changed attempt
      // ids → their task ids via the attempts_v view (carries taskId; index
      // attempts_task_id_idx).
      affectedMap: async (attemptIds) => {
        const rows = await db
          .selectDistinct({ taskId: attempts.taskId })
          .from(attempts)
          .where(inArray(attempts.id, [...attemptIds]));
        return rows.map((r) => r.taskId);
      },
    },
  ],
  loader: async (_params, ctx) => {
    // Every `tasks_v` column except `description`. The `satisfies
    // Record<keyof TaskListItem, unknown>` makes this projection fail to COMPILE
    // if it ever drifts from `TaskListItemSchema` (= `TaskSchema.omit({
    // description })`): adding a `_tasks` column makes it required in the schema,
    // so omitting it here is a type error. Previously the column set was
    // hand-listed with no such guard and the `as unknown as` cast below hid the
    // mismatch — a missing column (e.g. `titleAuto`) surfaced only at runtime as
    // a ZodError on every list load, freezing the whole tasks app.
    const listColumns = {
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
    } satisfies Record<keyof TaskListItem, unknown>;
    const sel = db.select(listColumns).from(tasks);
    const scoped = ctx?.affectedIds
      ? sel.where(inArray(tasks.id, [...ctx.affectedIds]))
      : sel;
    return scoped.orderBy(asc(tasks.rank), asc(tasks.createdAt)) as unknown as Promise<
      TaskListItem[]
    >;
  },
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
