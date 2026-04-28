import type { PluginDefinition } from "@core";
import { JsonlViewer } from "../../../web/slots";
import { UserImageRow } from "./components/user-image-row";

export default {
  id: "conversation-jsonl-viewer-user-image",
  name: "JSONL Viewer: User image renderer",
  description: "Renders inline image thumbnails for user-image events.",
  contributions: [
    JsonlViewer.EventRenderer({ kind: "user-image", component: UserImageRow }),
  ],
} satisfies PluginDefinition;
