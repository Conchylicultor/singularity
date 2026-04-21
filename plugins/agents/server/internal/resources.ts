import { asc } from "drizzle-orm";
import { db } from "../../../../server/src/db/client";
import { defineResource } from "../../../../server/src/resources";
import {
  listConversations,
  recentConversationsResource,
} from "@plugins/tasks-core/server";
import { _agent_launches } from "./tables";
import { agents, type Agent } from "./schema";
import type {
  AgentLaunchConversationRef,
  AgentLaunchWithStatus,
} from "../../shared/resources";

export const agentsResource = defineResource({
  key: "agents",
  mode: "push",
  loader: async (): Promise<Agent[]> =>
    db.select().from(agents).orderBy(asc(agents.rank), asc(agents.createdAt)),
});

export const agentLaunchesResource = defineResource({
  key: "agent-launches",
  mode: "push",
  // Re-notify whenever conversations change so `latestConversation` stays in
  // sync with the live status broadcast.
  dependsOn: [{ resource: recentConversationsResource }],
  loader: async (): Promise<AgentLaunchWithStatus[]> => {
    const [launches, convRows] = await Promise.all([
      db.select().from(_agent_launches).orderBy(asc(_agent_launches.createdAt)),
      listConversations(),
    ]);
    // listConversations() returns rows in createdAt desc order, so the first
    // hit per taskId is the latest.
    const latestByTask = new Map<string, AgentLaunchConversationRef>();
    for (const c of convRows) {
      if (latestByTask.has(c.taskId)) continue;
      latestByTask.set(c.taskId, { id: c.id, title: c.title, status: c.status });
    }
    return launches.map((l) => {
      const latest = latestByTask.get(l.taskId) ?? null;
      return {
        ...l,
        latestConversationStatus: latest?.status ?? null,
        latestConversation: latest,
      };
    });
  },
});
