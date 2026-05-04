import type { ServerPluginDefinition } from "@server/types";
import { handleTranscript } from "./internal/handle-transcript";

export default {
  id: "conversations-transcript-api",
  name: "Conversation Transcript API",
  description:
    "Agent API: GET /api/conversations/:id/transcript returns the on-disk JSONL path for a conversation's full raw Claude session transcript.",
  httpRoutes: {
    "GET /api/conversations/:id/transcript": handleTranscript,
  },
} satisfies ServerPluginDefinition;
