import type { ServerPluginDefinition } from "@server/types";
import { handleTranscript } from "./internal/handle-transcript";
import { getConversationTranscript } from "../shared/endpoints";

export default {
  id: "conversations-transcript-api",
  name: "Conversation Transcript API",
  description:
    "Agent API: GET /api/conversations/:id/transcript returns the on-disk JSONL path for a conversation's full raw Claude session transcript.",
  httpRoutes: {
    [getConversationTranscript.route]: handleTranscript,
  },
} satisfies ServerPluginDefinition;
