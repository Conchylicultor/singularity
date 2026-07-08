import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";

export { LOG_FORMAT, parseGitLog } from "./internal/parse-git-log";
export { GitError, runGit, tryRunGit } from "./internal/run-git";
export type { GitResult } from "./internal/run-git";

export default {
  description:
    "Git log parser and commit row types for reuse across plugins.",
} satisfies ServerPluginDefinition;
