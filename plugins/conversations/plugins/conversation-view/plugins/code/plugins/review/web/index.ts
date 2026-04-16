import type { PluginDefinition } from "@core";
import { Code } from "../../../web/slots";
import { ReviewButton } from "./components/review-button";

const reviewPlugin: PluginDefinition = {
  id: "conversation-code-review",
  name: "Conversation: Code — Review",
  description:
    "Toolbar button and full-screen view to review all worktree changes file-by-file.",
  contributions: [
    Code.ToolbarButton({
      component: ReviewButton,
    }),
  ],
};

export default reviewPlugin;
