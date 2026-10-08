import { asc, eq } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { implement } from "@plugins/infra/plugins/endpoints/server";
import { listConversationsForDisplay } from "@plugins/tasks/plugins/tasks-core/server";
import { listAgentLaunches } from "../../core/endpoints";
import type { AgentLaunchConversationRef } from "../../core/schemas";
import { _agent_launches } from "./tables";

// The same row the `agent-launches` set serves (`./agent-launch-rows.ts`), for
// one agent, derived a second way: the latest conversation per task from
// `listConversationsForDisplay` rather than the `task_latest_conversation`
// rollup. A known duplicate (P8 v3 D30: left as is in step 21, a follow-up
// task re-points it).
export const handleListLaunches = implement(
  listAgentLaunches,
  async ({ params }) => {
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
      latestByTask.set(c.taskId, {
        id: c.id,
        title: c.title,
        status: c.status,
      });
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
);
