import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { JsonlViewerTool } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/tool-call/web";
import { WorkflowToolView } from "./components/workflow-tool-view";

export default {
  id: "conversation-jsonl-viewer-tool-call-workflow",
  name: "JSONL Viewer: Workflow tool renderer",
  description:
    "Renders Workflow tool calls with the workflow name, description, numbered phase plan, a collapsible syntax-highlighted script, and the launched run/task ids.",
  contributions: [
    JsonlViewerTool.Renderer({ match: "Workflow", component: WorkflowToolView }),
  ],
} satisfies PluginDefinition;
