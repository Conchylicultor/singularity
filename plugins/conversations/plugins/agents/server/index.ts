import { Resource } from "@plugins/framework/plugins/server-core/core";
import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
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
import {
  listAgents,
  createAgent,
  getAgent,
  updateAgent,
  deleteAgent,
  launchAgent,
  listAgentLaunches,
} from "../core/endpoints";

export { _agent_launches, _agents } from "./internal/tables";
export { agents, AgentSchema, AgentLaunchSchema, AgentLaunchWithStatusSchema } from "./internal/schema";
export type { Agent, AgentLaunch, AgentLaunchWithStatus } from "./internal/schema";
export { agentsResource, agentLaunchesResource } from "./internal/resources";
export { AGENTS_META_TASK_ID } from "./internal/meta-agents";
export { nextAgentRankUnder } from "./internal/rank";

export default {
  description: "Named agent definitions that launch conversations.",
  httpRoutes: {
    [listAgents.route]: handleList,
    [createAgent.route]: handleCreate,
    [getAgent.route]: handleGet,
    [updateAgent.route]: handleUpdate,
    [deleteAgent.route]: handleDelete,
    [launchAgent.route]: handleLaunch,
    [listAgentLaunches.route]: handleListLaunches,
  },
  contributions: [Resource.Declare(agentsResource, { bootCritical: true }), Resource.Declare(agentLaunchesResource, { bootCritical: true })],
  onReady: async () => {
    await ensureAgentsMetaTask();
    await backfillAgentSvgNodes();
  },
} satisfies ServerPluginDefinition;
