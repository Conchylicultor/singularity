import type { PluginDefinition } from "@core";
import { JsonlViewer } from "../../../web/slots";
import { UserTextRow } from "./components/user-text-row";

export default {
  id: "conversation-jsonl-viewer-user-text",
  name: "JSONL Viewer: User text renderer",
  description: "Renders user text events in the JSONL viewer.",
  contributions: [
    JsonlViewer.EventRenderer({ kind: "user-text", component: UserTextRow }),
  ],
} satisfies PluginDefinition;
