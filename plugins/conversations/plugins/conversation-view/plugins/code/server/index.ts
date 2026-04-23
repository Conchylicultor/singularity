import type { ServerPluginDefinition } from "../../../../../../../server/src/types";
import { editedFilesResource } from "./internal/edited-files-resource";
import { handleFileContent } from "./internal/file-content-handler";
import { handleFileDiff } from "./internal/file-diff-handler";
import { handleImageContent } from "./internal/image-handler";

export default {
  id: "conversation-code",
  name: "Conversation: Code",
  description:
    "Tracks edited files in the conversation's worktree via the live-state primitive.",
  httpRoutes: {
    "GET /api/conversations/:id/file": handleFileContent,
    "GET /api/conversations/:id/diff": handleFileDiff,
    "GET /api/conversations/:id/image": handleImageContent,
  },
  resources: [editedFilesResource],
} satisfies ServerPluginDefinition;
