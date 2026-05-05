import type { PluginDefinition } from "@core";
import { JsonlViewerTool } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/tool-call/web";
import { AddTaskToolView } from "./components/add-task-tool-view";

export default {
  id: "conversation-jsonl-viewer-tool-call-add-task",
  name: "JSONL Viewer: add_task tool renderer",
  description:
    "Renders add_task MCP tool calls with task title, description, and a clickable chip to open the created task.",
  contributions: [
    JsonlViewerTool.Renderer({
      pattern: /add_task$/,
      component: AddTaskToolView,
    }),
  ],
} satisfies PluginDefinition;
