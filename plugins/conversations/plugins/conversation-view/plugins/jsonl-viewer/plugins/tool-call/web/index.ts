import type { PluginDefinition } from "@core";
import { JsonlViewer } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/web";
import { ToolCallRow } from "./components/tool-call-row";
import { CopyToolResultAction } from "./components/copy-result-action";

export { JsonlViewerTool } from "./slots";
export type { ToolRendererContribution } from "./slots";
export { ToolCallCard } from "./components/tool-call-card";

export default {
  id: "conversation-jsonl-viewer-tool-call",
  name: "JSONL Viewer: Tool call renderer",
  description:
    "Renders paired tool-call events with exact/pattern/fallback dispatch to per-tool renderer plugins.",
  contributions: [
    JsonlViewer.EventRenderer({ kind: "tool-call", component: ToolCallRow }),
    JsonlViewer.RowAction({ id: "copy-tool-result", component: CopyToolResultAction }),
  ],
} satisfies PluginDefinition;
