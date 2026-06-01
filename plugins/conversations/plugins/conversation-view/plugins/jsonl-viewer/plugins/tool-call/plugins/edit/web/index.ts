import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { JsonlViewerTool } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/tool-call/web";
import { EditView } from "./components/edit-view";
import { MultiEditView } from "./components/multi-edit-view";

export default {
  id: "conversation-jsonl-viewer-tool-edit",
  name: "JSONL Viewer: Edit tool renderer",
  description: "Renders Edit and MultiEdit tool calls as side-by-side syntax-highlighted diffs.",
  contributions: [
    JsonlViewerTool.Renderer({ match: "Edit", component: EditView }),
    JsonlViewerTool.Renderer({ match: "MultiEdit", component: MultiEditView }),
  ],
} satisfies PluginDefinition;
