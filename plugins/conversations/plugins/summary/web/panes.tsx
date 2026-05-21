import { Pane, PaneChrome, type } from "@plugins/primitives/plugins/pane/web";
import { SummaryPane } from "./components/summary-pane";

export const convSummaryPane = Pane.define({
  id: "conv-summary",
  segment: "summary",
  input: type<{ convId: string }>(),
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
