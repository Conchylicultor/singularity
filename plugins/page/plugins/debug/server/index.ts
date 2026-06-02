import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { ensureDebugDocument } from "../core";
import { handleEnsureDebugDocument } from "./internal/handle-ensure-debug-document";

export default {
  id: "page-debug",
  name: "Page Editor Debug",
  description: "Debug harness for the block-based page editor.",
  httpRoutes: {
    [ensureDebugDocument.route]: handleEnsureDebugDocument,
  },
} satisfies ServerPluginDefinition;
