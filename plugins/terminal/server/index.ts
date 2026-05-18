import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { wsHandler } from "./internal/ws-handler";

export default {
  id: "terminal",
  name: "Terminal",
  wsRoutes: {
    "/ws/terminal": wsHandler,
  },
} satisfies ServerPluginDefinition;
