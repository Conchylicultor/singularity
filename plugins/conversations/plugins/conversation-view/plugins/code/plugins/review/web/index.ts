import type { PluginDefinition } from "@core";
import { Pane } from "@plugins/primitives/plugins/pane/web";
import { Conversation } from "@plugins/conversations/plugins/conversation-view/plugins/action-bar/web";
import { Config } from "@plugins/config/web";
import { ReviewButton } from "./components/review-button";
import { reviewConfig } from "../shared/config";
import { convReviewPane } from "./panes";

export default {
  id: "conversation-code-review",
  name: "Conversation: Code — Review",
  description:
    "Toolbar button and full-screen view to review all worktree changes file-by-file.",
  contributions: [
    Pane.Register({ pane: convReviewPane }),
    Conversation.ActionBar({ id: "review", component: ReviewButton }),
    Config.Spec(reviewConfig),
  ],
} satisfies PluginDefinition;
