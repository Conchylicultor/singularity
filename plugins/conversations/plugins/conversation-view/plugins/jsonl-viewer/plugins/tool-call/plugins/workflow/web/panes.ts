import { Pane, defineRoute } from "@plugins/primitives/plugins/pane/web";
import { agentManagerApp } from "@plugins/apps/plugins/agent-manager/plugins/shell/core";
import { WorkflowNodePaneBody } from "./components/workflow-node-pane";

export const workflowNodePane = Pane.define({
  route: defineRoute({
    id: "workflow-node",
    segment: "workflow-node/:toolUseId/:nodeId",
  }),
  app: agentManagerApp,
  component: WorkflowNodePaneBody,
  // Conversation-scoped satellite: promote() would strip convId from the URL.
  chrome: { history: false, promote: false },
  width: 600,
  resolve: false,
});
