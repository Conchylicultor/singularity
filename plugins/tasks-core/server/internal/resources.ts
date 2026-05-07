import { asc, desc } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { defineResource } from "@server/resources";
import { pushes } from "./tables";
import { attempts, tasks } from "./schema";
import { TaskSchema, PushSchema, type Task } from "./schema";
import type { ConversationSummary } from "../../shared";
import {
  AttemptWithConversationsSchema,
  ConversationListPayloadSchema,
} from "../../shared";
import type { AttemptWithConversations, ConversationListPayload } from "../../shared";
import {
  countGoneConversations,
  listActiveConversations,
  listActiveSystemConversations,
  listConversationSummariesByAttempt,
  listGoneConversations,
  RECENT_GONE_LIMIT,
} from "./queries/conversations";
import { z } from "zod";

export const recentConversationsResource = defineResource({
  key: "conversations",
  mode: "push",
  schema: ConversationListPayloadSchema,
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
  dependsOn: [{ resource: recentConversationsResource }, { resource: pushesResource }],
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

export const tasksResource = defineResource<Task[]>({
  key: "tasks",
  mode: "push",
  schema: z.array(TaskSchema),
  dependsOn: [{ resource: attemptsResource }],
  loader: async () =>
    db.select().from(tasks).orderBy(asc(tasks.rank), asc(tasks.createdAt)) as unknown as Promise<Task[]>,
});
