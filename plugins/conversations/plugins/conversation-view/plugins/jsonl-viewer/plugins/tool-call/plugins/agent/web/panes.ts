import { Pane } from "@plugins/primitives/plugins/pane/web";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { AgentReportPaneBody } from "./components/agent-report-pane";

export const agentReportPane = Pane.define({
  id: "agent-report",
  after: [conversationPane],
  segment: "agent-report/:toolUseId",
  component: AgentReportPaneBody,
  chrome: { history: false },
  width: 600,
});
