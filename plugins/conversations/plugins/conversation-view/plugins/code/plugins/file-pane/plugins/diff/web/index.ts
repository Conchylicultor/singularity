import type { PluginDefinition } from "@core";
import { FilePane } from "../../../web/slots";
import { supportsDiff } from "./internal/supports";
import { DiffOrImageView } from "./internal/diff-or-image-view";

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
