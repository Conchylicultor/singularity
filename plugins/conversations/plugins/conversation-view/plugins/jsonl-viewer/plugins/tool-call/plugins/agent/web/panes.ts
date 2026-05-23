import { Pane, type } from "@plugins/primitives/plugins/pane/web";
import { AgentReportPaneBody } from "./components/agent-report-pane";

export const agentReportPane = Pane.define({
  id: "agent-report",
  segment: "agent-report/:toolUseId",
  input: type<{ convId: string }>(),
  component: AgentReportPaneBody,
  chrome: { history: false },
  width: 600,
  resolve: false,
});
