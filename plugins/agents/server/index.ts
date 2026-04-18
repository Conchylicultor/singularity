import type { ServerPluginDefinition } from "../../../server/src/types";
import { handleList } from "./internal/handle-list";
import { handleGet } from "./internal/handle-get";
import { handleCreate } from "./internal/handle-create";
import { handleUpdate } from "./internal/handle-update";
import { handleDelete } from "./internal/handle-delete";
import { handleLaunch } from "./internal/handle-launch";
import { handleListLaunches } from "./internal/handle-list-launches";
import { agentLaunchesResource, agentsResource } from "./internal/resources";
import { ensureAgentsMetaTask } from "./internal/meta-agents";

const plugin: ServerPluginDefinition = {
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
  resources: [agentsResource, agentLaunchesResource],
  onReady: async () => {
    await ensureAgentsMetaTask();
  },
};

export default plugin;
