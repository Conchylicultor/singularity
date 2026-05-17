import { Pane, PaneChrome } from "@plugins/primitives/plugins/pane/web";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { Review } from "./slots";

export const convReviewPane = Pane.define({
  id: "conv-review",
  after: [conversationPane],
  segment: "review",
  component: ConvReviewBody,
});

function ConvReviewBody() {
  const { conversation } = conversationPane.useData();
  return (
    <PaneChrome pane={convReviewPane} title="Review">
      <div className="h-full overflow-auto">
        <Review.Host conversationId={conversation.id} />
      </div>
    </PaneChrome>
  );
}
