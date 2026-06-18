import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { FilePane } from "@plugins/conversations/plugins/conversation-view/plugins/code/plugins/file-pane/web";
import { DiffOrImageView } from "@plugins/primitives/plugins/diff-view/web";
import { supportsDiff } from "./internal/supports";

export default {
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
