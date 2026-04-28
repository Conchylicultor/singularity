import type { PluginDefinition } from "@core";
import { JsonlViewer } from "../../../web/slots";
import { AssistantTextRow } from "./components/assistant-text-row";
import { CopyAssistantTextAction } from "./components/copy-text-action";

export default {
  id: "conversation-jsonl-viewer-assistant-text",
  name: "JSONL Viewer: Assistant text renderer",
  description: "Renders assistant text events in the JSONL viewer, with optional markdown rendering.",
  contributions: [
    JsonlViewer.EventRenderer({ kind: "assistant-text", component: AssistantTextRow }),
    JsonlViewer.RowAction({ id: "copy-assistant-text", component: CopyAssistantTextAction }),
  ],
} satisfies PluginDefinition;
