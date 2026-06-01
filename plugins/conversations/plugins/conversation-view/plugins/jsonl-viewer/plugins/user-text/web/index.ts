import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { JsonlViewer } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/web";
import { UserTextRow } from "./components/user-text-row";

export default {
  id: "conversation-jsonl-viewer-user-text",
  name: "JSONL Viewer: User text renderer",
  description: "Renders user text events in the JSONL viewer.",
  contributions: [
    JsonlViewer.EventRenderer({ match: "user-text", component: UserTextRow }),
  ],
} satisfies PluginDefinition;
