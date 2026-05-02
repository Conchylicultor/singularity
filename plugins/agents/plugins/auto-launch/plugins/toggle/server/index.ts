import type { ServerPluginDefinition } from "@server/types";
import { handleSet } from "./internal/handle-set";
import { agentAutoLaunchResource } from "./internal/resource";

export { _agentAutoLaunchExt } from "./internal/tables";
export { agentAutoLaunchResource } from "./internal/resource";

export default {
  id: "agents-auto-launch-toggle",
  name: "Agents: Auto-Launch Toggle",
  description:
    "Server side of the agent auto-launch toggle. Owns the agents_ext_auto_launch side-table via the entity-extensions primitive.",
  resources: [agentAutoLaunchResource],
  httpRoutes: {
    "POST /api/agent-auto-launch/:agentId": handleSet,
  },
} satisfies ServerPluginDefinition;
