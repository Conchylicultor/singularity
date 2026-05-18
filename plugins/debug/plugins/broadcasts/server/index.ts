import type { ServerPluginDefinition } from "@server/types";
import { handleRead } from "./internal/handle-read";
import { handleWrite } from "./internal/handle-write";
import { getBroadcasts, writeBroadcasts } from "../shared/endpoints";

export default {
  id: "debug-broadcasts",
  name: "Broadcasts",
  description: "View and edit cli/broadcasts.json from the UI.",
  httpRoutes: {
    [getBroadcasts.route]: handleRead,
    [writeBroadcasts.route]: handleWrite,
  },
} satisfies ServerPluginDefinition;
