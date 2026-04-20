import type { ServerPluginDefinition } from "../../../../../../../server/src/types";
import { editedFilesResource } from "./internal/edited-files-resource";
import { handleFileContent } from "./internal/file-content-handler";
import { handleFileDiff } from "./internal/file-diff-handler";

export default {
  id: "conversation-code",
  name: "Conversation: Code",
  description:
    "Tracks edited files in the conversation's worktree via the live-state primitive.",
  httpRoutes: {
    "GET /api/conversations/:id/file": handleFileContent,
    "GET /api/conversations/:id/diff": handleFileDiff,
  },
  resources: [editedFilesResource],
} satisfies ServerPluginDefinition;
