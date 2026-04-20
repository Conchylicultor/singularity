import type { ServerPluginDefinition } from "../../../server/src/types";
import { handleChannels } from "./internal/handle-channels";
import { wsHandler } from "./internal/ws-handler";

export { Log } from "./api";
export type { LogChannel, LogStream } from "./api";

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
