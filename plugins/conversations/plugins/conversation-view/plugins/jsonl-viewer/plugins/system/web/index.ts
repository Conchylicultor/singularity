import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { JsonlViewer } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/web";
import { SystemRow } from "./components/system-row";

export default {
  description: "Renders system events in the JSONL viewer.",
  contributions: [
    JsonlViewer.EventRenderer({ match: "system", component: SystemRow }),
  ],
} satisfies PluginDefinition;
