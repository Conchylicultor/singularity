import { Resource } from "@plugins/framework/plugins/server-core/core";
// Registers the agents' saved-icon source (module eval).
import "./internal/saved-icons";
import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { View } from "@plugins/database/plugins/derived-views/server";
import { DerivedTable } from "@plugins/database/plugins/derived-tables/server";
import { TaskCategory } from "@plugins/tasks/plugins/task-category/server";
import { handleList } from "./internal/handle-list";
import { handleGet } from "./internal/handle-get";
import { handleCreate } from "./internal/handle-create";
import { handleUpdate } from "./internal/handle-update";
import { handleMove } from "./internal/handle-move";
import { handleDelete } from "./internal/handle-delete";
import { handleLaunch } from "./internal/handle-launch";
import { handleListLaunches } from "./internal/handle-list-launches";
import { agentLaunchesResource, agentRowsServed } from "./internal/resources";
import { agents } from "./internal/views";
import { taskLatestConversationSpec } from "./internal/rollup-spec";
import {
  listAgents,
  createAgent,
  getAgent,
  updateAgent,
  moveAgent,
  deleteAgent,
  launchAgent,
  listAgentLaunches,
} from "../core/endpoints";

export { _agent_launches, _agents } from "./internal/tables";
export { agents } from "./internal/views";
export {
  AgentSchema,
  AgentLaunchSchema,
  AgentLaunchWithStatusSchema,
} from "./internal/schema";
export type {
  Agent,
  AgentLaunch,
  AgentLaunchWithStatus,
} from "./internal/schema";
export { agentLaunchesResource } from "./internal/resources";
export { nextAgentRankUnder } from "./internal/rank";

export default {
  description: "Named agent definitions that launch conversations.",
  httpRoutes: {
    [listAgents.route]: handleList,
    [createAgent.route]: handleCreate,
    [getAgent.route]: handleGet,
    [updateAgent.route]: handleUpdate,
    [moveAgent.route]: handleMove,
    [deleteAgent.route]: handleDelete,
    [launchAgent.route]: handleLaunch,
    [listAgentLaunches.route]: handleListLaunches,
  },
  contributions: [
    ...agentRowsServed.declare,
    Resource.Declare(agentLaunchesResource),
    View({ view: agents }),
    DerivedTable(taskLatestConversationSpec),
    TaskCategory({ id: "agents", label: "Agents", order: 2 }),
  ],
} satisfies ServerPluginDefinition;
