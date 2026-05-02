import type { ServerPluginDefinition } from "@server/types";
import { handleGetAllowFiles } from "./internal/allow-files-handler";

export default {
  id: "conversation-allow-monitor",
  name: "Conversation: Allow Monitor",
  httpRoutes: {
    "GET /api/conversations/:id/allow-files": handleGetAllowFiles,
  },
} satisfies ServerPluginDefinition;
