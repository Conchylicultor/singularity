import type { PluginDefinition } from "@core";
import { Code } from "@plugins/conversations/plugins/conversation-view/plugins/code/web";
import { ReviewButton } from "./components/review-button";

// Importing panes registers `convReviewPane` with the Pane registry.
import "./panes";

export default {
  id: "conversation-code-review",
  name: "Conversation: Code — Review",
  description:
    "Toolbar button and full-screen view to review all worktree changes file-by-file.",
  contributions: [
    Code.ToolbarButton({
      component: ReviewButton,
    }),
  ],
} satisfies PluginDefinition;
