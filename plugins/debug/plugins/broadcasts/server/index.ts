import type { ServerPluginDefinition } from "@server/types";
import { handleRead } from "./internal/handle-read";
import { handleWrite } from "./internal/handle-write";

export default {
  id: "debug-broadcasts",
  name: "Broadcasts",
  description: "View and edit cli/broadcasts.json from the UI.",
  httpRoutes: {
    "GET /api/debug/broadcasts": handleRead,
    "PUT /api/debug/broadcasts": handleWrite,
  },
} satisfies ServerPluginDefinition;
