import type { ServerPluginDefinition } from "@server/types";
import { handleExit } from "./internal/handle-exit";
import { exitConversation } from "../shared/endpoints";

export default {
  id: "exit",
  name: "Exit",
  httpRoutes: {
    [exitConversation.route]: handleExit,
  },
} satisfies ServerPluginDefinition;
