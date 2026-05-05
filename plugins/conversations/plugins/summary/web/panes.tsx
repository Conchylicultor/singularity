import { Pane, PaneChrome } from "@plugins/primitives/plugins/pane/web";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { SummaryPane } from "./components/summary-pane";

export const convSummaryPane = Pane.define({
  id: "conv-summary",
  after: [conversationPane],
  segment: "summary",
  component: ConvSummaryBody,
  chrome: { history: false },
});

function ConvSummaryBody() {
  return (
    <PaneChrome pane={convSummaryPane} title="Summary">
      <SummaryPane />
    </PaneChrome>
  );
}
