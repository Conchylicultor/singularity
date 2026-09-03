import { Pane } from "@plugins/primitives/plugins/pane/web";
import { defineRoute } from "@plugins/primitives/plugins/pane/core";
import { agentManagerApp } from "@plugins/apps/plugins/agent-manager/plugins/shell/core";
import { AgentReportPaneBody } from "./components/agent-report-pane";

const agentReportRoute = defineRoute({
  id: "agent-report",
  segment: "agent-report/:toolUseId",
});

export const agentReportPane = Pane.define({
  route: agentReportRoute,
  app: agentManagerApp,
  component: AgentReportPaneBody,
  // Conversation-scoped satellite: promote() would strip convId from the URL.
  chrome: { history: false, promote: false },
  width: 600,
  resolve: false,
});
