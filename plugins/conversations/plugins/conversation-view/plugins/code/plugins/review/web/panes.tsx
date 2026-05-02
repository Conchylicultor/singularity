import { Pane, PaneChrome } from "@plugins/primitives/plugins/pane/web";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { ReviewView } from "./components/review-view";

export const convReviewPane = Pane.define({
  id: "conv-review",
  parent: conversationPane,
  path: "review",
  component: ConvReviewBody,
  width: 720,
});

function ConvReviewBody() {
  return (
    <PaneChrome pane={convReviewPane} title="Review">
      <ReviewView />
    </PaneChrome>
  );
}
