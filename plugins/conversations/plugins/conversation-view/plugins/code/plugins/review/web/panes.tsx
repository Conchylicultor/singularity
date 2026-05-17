import { Pane, PaneChrome } from "@plugins/primitives/plugins/pane/web";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { ReviewView } from "./components/review-view";

export const convCodeReviewPane = Pane.define({
  id: "conv-code-review",
  after: [conversationPane],
  segment: "code-review",
  component: ConvCodeReviewBody,
  width: 720,
});

function ConvCodeReviewBody() {
  return (
    <PaneChrome pane={convCodeReviewPane} title="Code Review">
      <ReviewView />
    </PaneChrome>
  );
}
