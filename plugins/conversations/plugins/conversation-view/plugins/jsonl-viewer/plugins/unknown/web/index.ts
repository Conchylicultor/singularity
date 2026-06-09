import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { JsonlViewer } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/web";
import { UnknownRow } from "./components/unknown-row";

export default {
  description: "Renders unknown JSONL event types as collapsible sections with the raw payload.",
  contributions: [
    JsonlViewer.EventRenderer({ match: "unknown", component: UnknownRow }),
  ],
} satisfies PluginDefinition;
