import type { ServerPluginDefinition } from "@server/types";
import { handleCommitFiles } from "./internal/commit-handler";
import { handleFileContent } from "./internal/file-content-handler";
import { handleFileDiff } from "./internal/file-diff-handler";
import { handleImageContent } from "./internal/image-handler";
import { handlePushFiles } from "./internal/push-handler";
import { handleTree } from "./internal/tree-handler";

export default {
  id: "code-explorer",
  name: "Code Explorer",
  description:
    "Worktree-scoped file browser and viewer: tree listing plus raw/diff/image content by attempt id or the reserved `main` sentinel.",
  httpRoutes: {
    "GET /api/code/:worktree/tree": handleTree,
    "GET /api/code/:worktree/file": handleFileContent,
    "GET /api/code/:worktree/diff": handleFileDiff,
    "GET /api/code/:worktree/image": handleImageContent,
    "GET /api/code/:worktree/push": handlePushFiles,
    "GET /api/code/:worktree/commit": handleCommitFiles,
  },
} satisfies ServerPluginDefinition;
