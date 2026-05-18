import { Resource } from "@plugins/framework/plugins/server-core/core";
import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { handleSet } from "./internal/handle-set";
import { agentAutoLaunchResource } from "./internal/resource";
import { setAgentAutoLaunch } from "../shared/endpoints";

export { agentAutoLaunch } from "./internal/tables";
export { agentAutoLaunchResource } from "./internal/resource";

export default {
  id: "agents-auto-launch-toggle",
  name: "Agents: Auto-Launch Toggle",
  description:
    "Server side of the agent auto-launch toggle. Owns the agents_ext_auto_launch side-table via the entity-extensions primitive.",
  contributions: [Resource.Declare(agentAutoLaunchResource)],
  httpRoutes: {
    [setAgentAutoLaunch.route]: handleSet,
  },
} satisfies ServerPluginDefinition;
