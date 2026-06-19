import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";

export { createGitStateMemo } from "./internal/git-state-memo";
export type { GitStateMemo } from "./internal/git-state-memo";

export default {
  description:
    "Git-state-keyed result memo: skip a gated git recompute when a cheap ungated signature is unchanged; single-flight + coalesce per worktree.",
} satisfies ServerPluginDefinition;
