import type { ServerPluginDefinition } from "../../../../../../../server/src/types";
import { handleEditedFilesStream } from "./internal/edited-files-stream";

const plugin: ServerPluginDefinition = {
  id: "conversation-code",
  name: "Conversation: Code",
  description: "Streams edited files in the conversation's worktree via SSE.",
  httpRoutes: {
    "GET /api/conversations/:id/edited-files/stream": handleEditedFilesStream,
  },
};
export default plugin;
