import type { ServerPluginDefinition } from "@server/types";
import { handleRestoreBatch } from "./internal/handle-restore-batch";

export default {
  id: "conversations-recover",
  name: "Conversations Recover",
  description:
    "Batch-restore recently-closed conversations that were killed by a crash.",
  httpRoutes: {
    "POST /api/conversations-recover/restore-batch": handleRestoreBatch,
  },
} satisfies ServerPluginDefinition;
