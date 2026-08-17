import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Pane } from "@plugins/primitives/plugins/pane/web";
import { commitDetailPane } from "./panes";

export { commitDetailPane } from "./panes";
export { useCommitInfo, type CommitInfoState } from "./use-commit-info";

export default {
  description:
    "The one commit-diff pane, parameterized by worktree (commit/:worktree/:sha) rather than derived from an ancestor conversation, so any surface that can name a (worktree, sha) pair opens it. Also exposes useCommitInfo, the four-armed loading / found / not-found / error commit-metadata lookup.",
  contributions: [Pane.Register({ pane: commitDetailPane })],
  slots: [commitDetailPane],
} satisfies PluginDefinition;
