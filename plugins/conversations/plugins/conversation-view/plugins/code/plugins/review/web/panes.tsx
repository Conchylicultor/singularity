import { Pane } from "@plugins/pane/web";
import {
  conversationPane,
  markMainPane,
} from "@plugins/conversations/plugins/conversation-view/web";
import { ReviewView } from "./components/review-view";

export const convReviewPane = Pane.define({
  id: "conv-review",
  parent: conversationPane,
  path: "review",
  component: ReviewView,
});

// Review takes over the entire conversation main area rather than rendering
// alongside the terminal. Flag it here so ConversationView swaps to the
// full-outlet layout when this pane is the match leaf.
markMainPane(convReviewPane);
