import type { ServerPluginDefinition } from "../../../server/src/types";
import { handleChannels } from "./internal/handle-channels";
import { wsHandler } from "./internal/ws-handler";

export { Log } from "./internal/api";
export type { LogChannel, LogStream } from "./internal/api";

export default {
  id: "logs",
  name: "Logs",
  httpRoutes: {
    "GET /api/logs/channels": handleChannels,
  },
  wsRoutes: {
    "/ws/logs": wsHandler,
  },
} satisfies ServerPluginDefinition;
