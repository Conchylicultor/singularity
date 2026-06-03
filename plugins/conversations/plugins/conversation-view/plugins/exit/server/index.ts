import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { handleExit } from "./internal/handle-exit";
import { exitConversation } from "../shared/endpoints";

export default {
  name: "Exit",
  httpRoutes: {
    [exitConversation.route]: handleExit,
  },
} satisfies ServerPluginDefinition;
