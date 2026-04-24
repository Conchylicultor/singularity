import type { PluginDefinition } from "@core";
import { JsonlViewer } from "../../../web/slots";
import { SystemRow } from "./components/system-row";

export default {
  id: "conversation-jsonl-viewer-system",
  name: "JSONL Viewer: System event renderer",
  description: "Renders system events in the JSONL viewer.",
  contributions: [
    JsonlViewer.EventRenderer({ kind: "system", component: SystemRow }),
  ],
} satisfies PluginDefinition;
