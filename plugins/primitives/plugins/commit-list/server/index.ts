import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";

export { LOG_FORMAT, parseGitLog } from "./internal/parse-git-log";
export { runGit } from "./internal/run-git";

export default {
  id: "commit-list",
  name: "Commit List",
  description:
    "Git log parser and commit row types for reuse across plugins.",
} satisfies ServerPluginDefinition;
