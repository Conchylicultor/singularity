import type { ServerPluginDefinition } from "@server/types";
import { handleChannels } from "./internal/handle-channels";
import { wsHandler } from "./internal/ws-handler";

export { Log } from "./internal/log";
export type { LogChannel, LogStream } from "./internal/log";

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
