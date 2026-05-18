import type { ServerPluginDefinition } from "@server/types";
import { handleCommitFiles } from "./internal/commit-handler";
import { handleFileContent } from "./internal/file-content-handler";
import { handleFileDiff } from "./internal/file-diff-handler";
import { handleImageContent } from "./internal/image-handler";
import { handlePushFiles } from "./internal/push-handler";
import { handleTree } from "./internal/tree-handler";
import { getCodeTree, getFileContent, getFileDiff, getImageContent, getPushFiles, getCommitFiles } from "../shared/endpoints";

export { resolveWorktreePath } from "./internal/resolve-worktree-path";
export { resolveParentSha, getRangeFiles } from "./internal/get-push-files";

export default {
  id: "code-explorer",
  name: "Code Explorer",
  description:
    "Worktree-scoped file browser and viewer: tree listing plus raw/diff/image content by attempt id or the reserved `main` sentinel.",
  httpRoutes: {
    [getCodeTree.route]: handleTree,
    [getFileContent.route]: handleFileContent,
    [getFileDiff.route]: handleFileDiff,
    [getImageContent.route]: handleImageContent,
    [getPushFiles.route]: handlePushFiles,
    [getCommitFiles.route]: handleCommitFiles,
  },
} satisfies ServerPluginDefinition;
