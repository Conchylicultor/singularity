import type { PluginDefinition } from "@core";
import { JsonlViewer } from "../../../web/slots";
import { AssistantToolUseRow } from "./components/assistant-tool-use-row";

export default {
  id: "conversation-jsonl-viewer-assistant-tool-use",
  name: "JSONL Viewer: Tool use renderer",
  description: "Renders assistant tool-use events in the JSONL viewer.",
  contributions: [
    JsonlViewer.EventRenderer({ kind: "assistant-tool-use", component: AssistantToolUseRow }),
  ],
} satisfies PluginDefinition;
