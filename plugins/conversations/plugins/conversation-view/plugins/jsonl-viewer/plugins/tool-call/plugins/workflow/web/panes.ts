import { Pane, type } from "@plugins/primitives/plugins/pane/web";
import { WorkflowNodePaneBody } from "./components/workflow-node-pane";

export const workflowNodePane = Pane.define({
  id: "workflow-node",
  segment: "workflow-node/:toolUseId/:nodeId",
  input: type<{ convId: string }>(),
  component: WorkflowNodePaneBody,
  chrome: { history: false },
  width: 600,
  resolve: false,
});
