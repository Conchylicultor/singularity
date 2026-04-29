import type { PluginDefinition } from "@core";
import { JsonlViewer } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/web";
import { SystemRow } from "./components/system-row";

export default {
  id: "conversation-jsonl-viewer-system",
  name: "JSONL Viewer: System event renderer",
  description: "Renders system events in the JSONL viewer.",
  contributions: [
    JsonlViewer.EventRenderer({ kind: "system", component: SystemRow }),
  ],
} satisfies PluginDefinition;
