import { asc, eq } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { implement } from "@plugins/infra/plugins/endpoints/server";
import { listConversationsForDisplay } from "@plugins/tasks/plugins/tasks-core/server";
import { listAgentLaunches } from "../../core/endpoints";
import type { AgentLaunchConversationRef } from "../../shared/resources";
import { _agent_launches } from "./tables";

export const handleListLaunches = implement(listAgentLaunches, async ({ params }) => {
  const [launches, convRows] = await Promise.all([
    db
      .select()
      .from(_agent_launches)
      .where(eq(_agent_launches.agentId, params.id))
      .orderBy(asc(_agent_launches.createdAt)),
    listConversationsForDisplay(),
  ]);
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
});
