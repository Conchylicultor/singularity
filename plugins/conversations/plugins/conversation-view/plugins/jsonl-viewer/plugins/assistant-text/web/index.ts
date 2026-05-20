import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { JsonlViewer } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/web";
import { AssistantTextRow } from "./components/assistant-text-row";
import { CopyAssistantTextAction } from "./components/copy-text-action";
import { MarkdownToggleAction } from "./components/markdown-toggle-action";
import { StopReasonAction } from "./components/stop-reason-action";

export default {
  id: "conversation-jsonl-viewer-assistant-text",
  name: "JSONL Viewer: Assistant text renderer",
  description: "Renders assistant text events in the JSONL viewer, with optional markdown rendering.",
  contributions: [
    JsonlViewer.EventRenderer({ kind: "assistant-text", component: AssistantTextRow }),
    JsonlViewer.RowAction({ id: "stop-reason", component: StopReasonAction }),
    JsonlViewer.RowAction({ id: "markdown-toggle", component: MarkdownToggleAction }),
    JsonlViewer.RowAction({ id: "copy-assistant-text", component: CopyAssistantTextAction }),
  ],
} satisfies PluginDefinition;
