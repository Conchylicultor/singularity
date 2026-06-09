import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { handleTranscript } from "./internal/handle-transcript";
import { getConversationTranscript } from "../shared/endpoints";

export default {
  description:
    "Agent API: GET /api/conversations/:id/transcript returns the on-disk JSONL path for a conversation's full raw Claude session transcript.",
  httpRoutes: {
    [getConversationTranscript.route]: handleTranscript,
  },
} satisfies ServerPluginDefinition;
