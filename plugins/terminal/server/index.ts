import type { ServerPluginDefinition } from "../../../server/src/types";
import { wsHandler } from "./internal/ws-handler";

export default {
  id: "terminal",
  name: "Terminal",
  wsRoutes: {
    "/ws/terminal": wsHandler,
  },
} satisfies ServerPluginDefinition;
