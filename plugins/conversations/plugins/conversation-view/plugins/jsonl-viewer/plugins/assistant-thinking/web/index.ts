import type { PluginDefinition } from "@core";
import { JsonlViewer } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/web";
import { AssistantThinkingRow } from "./components/assistant-thinking-row";

export default {
  id: "conversation-jsonl-viewer-assistant-thinking",
  name: "JSONL Viewer: Assistant thinking renderer",
  description: "Renders assistant thinking blocks in the JSONL viewer as collapsible sections.",
  contributions: [
    JsonlViewer.EventRenderer({ kind: "assistant-thinking", component: AssistantThinkingRow }),
  ],
} satisfies PluginDefinition;
