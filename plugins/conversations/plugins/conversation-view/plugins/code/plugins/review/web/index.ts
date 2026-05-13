import type { PluginDefinition } from "@core";
import { Pane } from "@plugins/primitives/plugins/pane/web";
import { Conversation } from "@plugins/conversations/plugins/conversation-view/plugins/action-bar/web";
import { Config } from "@plugins/config/web";
import { ReviewButton } from "./components/review-button";
import { ReviewSectionsSettings } from "./components/review-sections-settings";
import { reviewConfig } from "@plugins/conversations/plugins/conversation-view/plugins/code/plugins/review/shared/config";
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
    Config.Section({
      id: "review-sections",
      title: "Review Sections",
      description:
        "File groupings shown in the review pane. Files matching a section's patterns are grouped under that section header.",
      component: ReviewSectionsSettings,
    }),
  ],
} satisfies PluginDefinition;
