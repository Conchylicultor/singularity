import type { PluginDefinition } from "@core";
import { JsonlViewerTool } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/tool-call/web";
import { EditView } from "./components/edit-view";
import { EditSummary } from "./components/edit-summary";
import { MultiEditView } from "./components/multi-edit-view";

export default {
  id: "conversation-jsonl-viewer-tool-edit",
  name: "JSONL Viewer: Edit tool renderer",
  description: "Renders Edit and MultiEdit tool calls as side-by-side syntax-highlighted diffs.",
  contributions: [
    JsonlViewerTool.Renderer({ name: "Edit", component: EditView, summary: EditSummary, defaultOpen: true }),
    JsonlViewerTool.Renderer({ name: "MultiEdit", component: MultiEditView, summary: EditSummary, defaultOpen: true }),
  ],
} satisfies PluginDefinition;
