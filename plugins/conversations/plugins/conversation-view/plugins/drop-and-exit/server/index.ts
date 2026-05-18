import type { ServerPluginDefinition } from "@server/types";
import { handleDropAndExit } from "./internal/handle-drop-and-exit";
import { dropAndExit } from "../shared/endpoints";

export default {
  id: "drop-and-exit",
  name: "Drop and Exit",
  httpRoutes: {
    [dropAndExit.route]: handleDropAndExit,
  },
} satisfies ServerPluginDefinition;
