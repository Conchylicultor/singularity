import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { JsonlViewer } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/web";
import { PrepromptRow } from "./components/preprompt-row";

export default {
  description:
    "Renders the launch special-instructions (preprompt) block as a collapsible section in the JSONL viewer.",
  contributions: [
    JsonlViewer.EventRenderer({
      match: "preprompt",
      component: PrepromptRow,
    }),
  ],
} satisfies PluginDefinition;
