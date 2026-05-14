import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { JsonlViewer } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/web";
import { UserImageRow } from "./components/user-image-row";

export default {
  id: "conversation-jsonl-viewer-user-image",
  name: "JSONL Viewer: User image renderer",
  description: "Renders inline image thumbnails for user-image events.",
  contributions: [
    JsonlViewer.EventRenderer({ kind: "user-image", component: UserImageRow }),
  ],
} satisfies PluginDefinition;
