import type { ServerPluginDefinition } from "@server/types";
import { getAllowFiles } from "../shared/endpoints";
import { handleGetAllowFiles } from "./internal/allow-files-handler";

export default {
  id: "conversation-allow-monitor",
  name: "Conversation: Allow Monitor",
  httpRoutes: {
    [getAllowFiles.route]: handleGetAllowFiles,
  },
} satisfies ServerPluginDefinition;
