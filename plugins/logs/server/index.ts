import type { ServerPluginDefinition } from "../../../server/src/types";
import { handleChannels } from "./internal/handle-channels";
import { wsHandler } from "./internal/ws-handler";

const plugin: ServerPluginDefinition = {
  id: "logs",
  name: "Logs",
  httpRoutes: {
    "GET /api/logs/channels": handleChannels,
  },
  wsRoutes: {
    "/ws/logs": wsHandler,
  },
};
export default plugin;
