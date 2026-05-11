import type { ServerPluginDefinition } from "@server/types";
import { Resource } from "@server/resources";
import { handleSet } from "./internal/handle-set";
import { agentAutoLaunchResource } from "./internal/resource";

export { agentAutoLaunch } from "./internal/tables";
export { agentAutoLaunchResource } from "./internal/resource";

export default {
  id: "agents-auto-launch-toggle",
  name: "Agents: Auto-Launch Toggle",
  description:
    "Server side of the agent auto-launch toggle. Owns the agents_ext_auto_launch side-table via the entity-extensions primitive.",
  contributions: [Resource.Declare(agentAutoLaunchResource)],
  httpRoutes: {
    "POST /api/agent-auto-launch/:agentId": handleSet,
  },
} satisfies ServerPluginDefinition;
