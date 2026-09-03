import { Pane, PaneChrome } from "@plugins/primitives/plugins/pane/web";
import { defineRoute } from "@plugins/primitives/plugins/pane/core";
import { agentManagerApp } from "@plugins/apps/plugins/agent-manager/plugins/shell/core";
import { SummaryPane } from "./components/summary-pane";

const convSummaryRoute = defineRoute({
  id: "conv-summary",
  segment: "summary",
});

export const convSummaryPane = Pane.define({
  route: convSummaryRoute,
  app: agentManagerApp,
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
