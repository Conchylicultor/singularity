import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { fileExplorerCheckout } from "../core";
import { handleCheckout } from "./internal/checkout";

export default {
  description:
    "Where the file explorer's Singularity place leads: the main checkout's path (GET /api/file-explorer/checkout).",
  httpRoutes: {
    [fileExplorerCheckout.route]: handleCheckout,
  },
} satisfies ServerPluginDefinition;
