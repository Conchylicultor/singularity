import type { ServerPluginDefinition } from "../../../../../../../server/src/types";
import { handleListEvents } from "./internal/handle-list-events";

export default {
  id: "conversation-jsonl-viewer",
  name: "Conversation: JSONL viewer",
  description:
    "Parses Claude's raw JSONL session log and serves it as structured events for the viewer pane.",
  httpRoutes: {
    "GET /api/conversations/:id/jsonl": handleListEvents,
  },
} satisfies ServerPluginDefinition;
