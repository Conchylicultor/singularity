import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { handleChannels } from "./internal/handle-channels";
import { wsHandler } from "./internal/ws-handler";
import { getLogChannels } from "../core/endpoints";

export { Log } from "./internal/log";
export type { LogChannel, LogStream } from "./internal/log";

export default {
  name: "Logs",
  httpRoutes: {
    [getLogChannels.route]: handleChannels,
  },
  wsRoutes: {
    "/ws/logs": wsHandler,
  },
} satisfies ServerPluginDefinition;
