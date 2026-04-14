import type { ServerPluginDefinition } from "../../../../../../../server/src/types";
import { handleEditedFilesStream } from "./internal/edited-files-stream";
import { handleFileContent } from "./internal/file-content-handler";

const plugin: ServerPluginDefinition = {
  id: "conversation-code",
  name: "Conversation: Code",
  description: "Streams edited files in the conversation's worktree via SSE.",
  httpRoutes: {
    "GET /api/conversations/:id/edited-files/stream": handleEditedFilesStream,
    "GET /api/conversations/:id/file": handleFileContent,
  },
};
export default plugin;
