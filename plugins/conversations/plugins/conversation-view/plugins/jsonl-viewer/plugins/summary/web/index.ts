import type { PluginDefinition } from "@core";
import { JsonlViewer } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/web";
import { SummaryRow } from "./components/summary-row";

export default {
  id: "conversation-jsonl-viewer-summary",
  name: "JSONL Viewer: Summary renderer",
  description: "Renders summary separator events in the JSONL viewer.",
  contributions: [
    JsonlViewer.EventRenderer({ kind: "summary", component: SummaryRow }),
  ],
} satisfies PluginDefinition;
