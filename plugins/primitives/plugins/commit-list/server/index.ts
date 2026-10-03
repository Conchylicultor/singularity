import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";

export { LOG_FORMAT, parseGitLog } from "./internal/parse-git-log";
export {
  GitError,
  WorktreeGoneError,
  runGit,
  tryRunGit,
} from "./internal/run-git";
export type { GitResult } from "./internal/run-git";
export {
  parseDiffNameStatusZ,
  parseDiffNumstatZ,
} from "./internal/parse-diff-z";
export type { NameStatusRecord } from "./internal/parse-diff-z";

export default {
  description:
    "Git log parser, `git diff -z` name-status / numstat parsers, the runGit invocation and commit row types for reuse across plugins.",
} satisfies ServerPluginDefinition;
