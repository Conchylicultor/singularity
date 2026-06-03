import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { FilePane } from "@plugins/conversations/plugins/conversation-view/plugins/code/plugins/file-pane/web";
import { supportsDiff } from "./internal/supports";
import { DiffOrImageView } from "./internal/diff-or-image-view";

export { DiffView, DiffRenderer } from "./components/diff-view";
export { TextDiff } from "./components/text-diff";
export { DiffOrImageView } from "./internal/diff-or-image-view";
export type { DiffTokens, ShikiTokenNode } from "./use-diff-tokens";
export { buildSideTokenMap } from "./use-diff-tokens";

export default {
  id: "conversation-code-file-pane-diff",
  name: "Conversation: Code — Diff renderer",
  description:
    "Side-by-side diff of the file vs HEAD in the conversation's worktree.",
  contributions: [
    FilePane.Renderer({
      id: "diff",
      label: "Diff",
      supports: supportsDiff,
      component: DiffOrImageView,
    }),
  ],
} satisfies PluginDefinition;
