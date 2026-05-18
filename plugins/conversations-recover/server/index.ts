import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { handleRestoreBatch } from "./internal/handle-restore-batch";
import { restoreBatch } from "../shared/endpoints";

export default {
  id: "conversations-recover",
  name: "Conversations Recover",
  description:
    "Batch-restore recently-closed conversations that were killed by a crash.",
  httpRoutes: {
    [restoreBatch.route]: handleRestoreBatch,
  },
} satisfies ServerPluginDefinition;
