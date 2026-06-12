import { asc } from "drizzle-orm";
import { z } from "zod";
import { db } from "@plugins/database/server";
import { defineResource } from "@plugins/framework/plugins/server-core/core";
import {
  listConversationsForDisplay,
  conversationsLiveResource,
} from "@plugins/tasks/plugins/tasks-core/server";
import { _agent_launches } from "./tables";
import {
  agents,
  AgentSchema,
  AgentLaunchWithStatusSchema,
  type Agent,
  type AgentLaunchWithStatus,
} from "./schema";
import type { AgentLaunchConversationRef } from "../../shared/resources";

export const agentsResource = defineResource<Agent[]>({
  key: "agents",
  mode: "push",
  schema: z.array(AgentSchema),
  loader: async () =>
    db.select().from(agents).orderBy(asc(agents.rank), asc(agents.createdAt)) as unknown as Promise<Agent[]>,
});

export const agentLaunchesResource = defineResource({
  key: "agent-launches",
  mode: "push",
  schema: z.array(AgentLaunchWithStatusSchema),
  // Re-notify whenever conversations change so `latestConversation` stays in
  // sync with the live status broadcast.
  dependsOn: [{ resource: conversationsLiveResource }],
  loader: async (): Promise<AgentLaunchWithStatus[]> => {
    const [launches, convRows] = await Promise.all([
      db.select().from(_agent_launches).orderBy(asc(_agent_launches.createdAt)),
      listConversationsForDisplay(),
    ]);
    // Returned rows are in createdAt desc order, so the first hit per taskId
    // is the latest.
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
