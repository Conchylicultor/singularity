import type { PluginDefinition } from "@core";
import { JsonlViewer } from "../../../web/slots";
import { AssistantTextRow } from "./components/assistant-text-row";

export default {
  id: "conversation-jsonl-viewer-assistant-text",
  name: "JSONL Viewer: Assistant text renderer",
  description: "Renders assistant text events in the JSONL viewer, with optional markdown rendering.",
  contributions: [
    JsonlViewer.EventRenderer({ kind: "assistant-text", component: AssistantTextRow }),
  ],
} satisfies PluginDefinition;
