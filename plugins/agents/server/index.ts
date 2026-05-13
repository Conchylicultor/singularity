import type { ServerPluginDefinition } from "@server/types";
import { Resource } from "@server/resources";
import { handleList } from "./internal/handle-list";
import { handleGet } from "./internal/handle-get";
import { handleCreate } from "./internal/handle-create";
import { handleUpdate } from "./internal/handle-update";
import { handleDelete } from "./internal/handle-delete";
import { handleLaunch } from "./internal/handle-launch";
import { handleListLaunches } from "./internal/handle-list-launches";
import { agentLaunchesResource, agentsResource } from "./internal/resources";
import { ensureAgentsMetaTask } from "./internal/meta-agents";
import { backfillAgentSvgNodes } from "./internal/backfill-svg";

export { _agent_launches, _agents } from "./internal/tables";
export { agents, AgentSchema, AgentLaunchSchema, AgentLaunchWithStatusSchema } from "./internal/schema";
export type { Agent, AgentLaunch, AgentLaunchWithStatus } from "./internal/schema";
export { agentsResource, agentLaunchesResource } from "./internal/resources";
export { AGENTS_META_TASK_ID } from "./internal/meta-agents";
export { nextAgentRankUnder } from "./internal/rank";

export default {
  id: "agents",
  name: "Agents",
  description: "Named agent definitions that launch conversations.",
  httpRoutes: {
    "GET /api/agents": handleList,
    "POST /api/agents": handleCreate,
    "GET /api/agents/:id": handleGet,
    "PATCH /api/agents/:id": handleUpdate,
    "DELETE /api/agents/:id": handleDelete,
    "POST /api/agents/:id/launch": handleLaunch,
    "GET /api/agents/:id/launches": handleListLaunches,
  },
  contributions: [Resource.Declare(agentsResource), Resource.Declare(agentLaunchesResource)],
  onReady: async () => {
    await ensureAgentsMetaTask();
    await backfillAgentSvgNodes();
  },
} satisfies ServerPluginDefinition;
