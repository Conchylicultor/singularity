import { Pane } from "@plugins/primitives/plugins/pane/web";
import { agentManagerApp } from "@plugins/apps/plugins/agent-manager/plugins/shell/core";
import { AgentReportPaneBody } from "./components/agent-report-pane";

export const agentReportPane = Pane.define({
  id: "agent-report",
  app: agentManagerApp,
  segment: "agent-report/:toolUseId",
  component: AgentReportPaneBody,
  // Conversation-scoped satellite: promote() would strip convId from the URL.
  chrome: { history: false, promote: false },
  width: 600,
  resolve: false,
});
