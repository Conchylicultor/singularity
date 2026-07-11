import { Pane } from "@plugins/primitives/plugins/pane/web";
import { AgentReportPaneBody } from "./components/agent-report-pane";

export const agentReportPane = Pane.define({
  id: "agent-report",
  segment: "agent-report/:toolUseId",
  component: AgentReportPaneBody,
  // Conversation-scoped satellite: promote() would strip convId from the URL.
  chrome: { history: false, promote: false },
  width: 600,
  resolve: false,
});
