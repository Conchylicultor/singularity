import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { handleTranscript } from "./internal/handle-transcript";
import { getConversationTranscript } from "../shared/endpoints";

export default {
  description:
    "Agent API: GET /api/conversations/:id/transcript returns the ordered on-disk JSONL paths of a conversation's Claude session chain.",
  httpRoutes: {
    [getConversationTranscript.route]: handleTranscript,
  },
} satisfies ServerPluginDefinition;
