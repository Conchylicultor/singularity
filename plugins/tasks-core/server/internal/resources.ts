import { asc, desc } from "drizzle-orm";
import { db } from "@server/db/client";
import { defineResource } from "@server/resources";
import { pushes } from "./tables";
import { attempts, tasks } from "./schema";
import type { Conversation, Push, Task } from "./schema";
import type {
  AttemptWithConversations,
  ConversationSummary,
} from "../../shared";
import {
  listActiveConversations,
  listConversationSummariesByAttempt,
  listGoneConversations,
  RECENT_GONE_LIMIT,
} from "./queries/conversations";

type ConversationListPayload = {
  active: Conversation[];
  recentGone: Conversation[];
  hasMoreGone: boolean;
};

export const recentConversationsResource = defineResource({
  key: "conversations",
  mode: "push",
  loader: async (): Promise<ConversationListPayload> => {
    const [active, goneRows] = await Promise.all([
      listActiveConversations(),
      listGoneConversations({ limit: RECENT_GONE_LIMIT + 1 }),
    ]);
    const hasMoreGone = goneRows.length > RECENT_GONE_LIMIT;
    return {
      active,
      recentGone: hasMoreGone ? goneRows.slice(0, RECENT_GONE_LIMIT) : goneRows,
      hasMoreGone,
    };
  },
});

export const pushesResource = defineResource({
  key: "pushes",
  mode: "push",
  loader: async (): Promise<Push[]> =>
    db.select().from(pushes).orderBy(desc(pushes.createdAt)),
});

export const attemptsResource = defineResource({
  key: "attempts",
  mode: "push",
  dependsOn: [{ resource: recentConversationsResource }, { resource: pushesResource }],
  loader: async (): Promise<AttemptWithConversations[]> => {
    const [attemptRows, convRows] = await Promise.all([
      db.select().from(attempts).orderBy(asc(attempts.createdAt)),
      listConversationSummariesByAttempt(),
    ]);
    const byAttempt = new Map<string, ConversationSummary[]>();
    for (const c of convRows) {
      const summary: ConversationSummary = { id: c.id, title: c.title, status: c.status };
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

export const tasksResource = defineResource({
  key: "tasks",
  mode: "push",
  dependsOn: [{ resource: attemptsResource }],
  loader: async (): Promise<Task[]> =>
    db.select().from(tasks).orderBy(asc(tasks.rank), asc(tasks.createdAt)),
});
