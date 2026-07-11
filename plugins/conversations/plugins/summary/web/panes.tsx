import { Pane, PaneChrome } from "@plugins/primitives/plugins/pane/web";
import { SummaryPane } from "./components/summary-pane";

export const convSummaryPane = Pane.define({
  id: "conv-summary",
  segment: "summary",
  component: ConvSummaryBody,
  // Conversation-scoped satellite: promote() would strip convId from the URL.
  chrome: { history: false, promote: false },
});

function ConvSummaryBody() {
  return (
    <PaneChrome pane={convSummaryPane} title="Summary">
      <SummaryPane />
    </PaneChrome>
  );
}
