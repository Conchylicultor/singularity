import { Pane } from "@plugins/primitives/plugins/pane/web";
import { WorkflowNodePaneBody } from "./components/workflow-node-pane";

export const workflowNodePane = Pane.define({
  id: "workflow-node",
  segment: "workflow-node/:toolUseId/:nodeId",
  component: WorkflowNodePaneBody,
  // Conversation-scoped satellite: promote() would strip convId from the URL.
  chrome: { history: false, promote: false },
  width: 600,
  resolve: false,
});
