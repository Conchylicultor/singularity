import { asc, desc, eq } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { defineResource } from "@plugins/framework/plugins/server-core/core";
import { pushes } from "./tables";
import { attempts, tasks } from "./schema";
import {
  TaskSchema,
  TaskListItemSchema,
  PushSchema,
  type Task,
  type TaskListItem,
} from "./schema";
import type { ConversationSummary } from "../../core";
import {
  AttemptWithConversationsSchema,
  conversationsResource,
} from "../../core";
import type { AttemptWithConversations, ConversationListPayload } from "../../core";
import {
  countGoneConversations,
  listActiveConversations,
  listActiveSystemConversations,
  listConversationSummariesByAttempt,
  listGoneConversations,
  RECENT_GONE_LIMIT,
} from "./queries/conversations";
import { z } from "zod";

export const conversationsLiveResource = defineResource({
  key: conversationsResource.key,
  mode: "push",
  schema: conversationsResource.schema,
  loader: async (): Promise<ConversationListPayload> => {
    const [active, goneRows, totalGoneCount, system] = await Promise.all([
      listActiveConversations(),
      listGoneConversations({ limit: RECENT_GONE_LIMIT + 1 }),
      countGoneConversations(),
      listActiveSystemConversations(),
    ]);
    const hasMoreGone = goneRows.length > RECENT_GONE_LIMIT;
    return {
      active,
      recentGone: hasMoreGone ? goneRows.slice(0, RECENT_GONE_LIMIT) : goneRows,
      hasMoreGone,
      totalGoneCount,
      system,
    };
  },
});

export const pushesResource = defineResource({
  key: "pushes",
  mode: "push",
  schema: z.array(PushSchema),
  loader: async () =>
    db.select().from(pushes).orderBy(desc(pushes.createdAt)),
});

export const attemptsResource = defineResource({
  key: "attempts",
  mode: "push",
  schema: z.array(AttemptWithConversationsSchema),
  dependsOn: [{ resource: conversationsLiveResource }, { resource: pushesResource }],
  loader: async (): Promise<AttemptWithConversations[]> => {
    const [attemptRows, convRows] = await Promise.all([
      db.select().from(attempts).orderBy(asc(attempts.createdAt)),
      listConversationSummariesByAttempt(),
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
export const tasksResource = defineResource<TaskListItem[]>({
  key: "tasks",
  mode: "push",
  schema: z.array(TaskListItemSchema),
  dependsOn: [{ resource: attemptsResource }],
  loader: async () =>
    db
      .select({
        id: tasks.id,
        folderId: tasks.folderId,
        groupId: tasks.groupId,
        title: tasks.title,
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
      })
      .from(tasks)
      .orderBy(asc(tasks.rank), asc(tasks.createdAt)) as unknown as Promise<TaskListItem[]>,
});

// Per-id detail resource: the full task row (incl. `description`). Only loads
// for an open detail pane (parametrized by id) and re-pushes when that one task
// is mutated — so the bulk list stays lean while the description editor remains
// live across tabs/agents. The list resource stays authoritative for derived
// fields (status/finishedAt); this exists to supply `description`.
export const taskDetailResource = defineResource<Task | null, { id: string }>({
  key: "task-detail",
  mode: "push",
  schema: TaskSchema.nullable(),
  loader: async ({ id }) => {
    const [row] = await db.select().from(tasks).where(eq(tasks.id, id)).limit(1);
    return (row as unknown as Task | undefined) ?? null;
  },
});
