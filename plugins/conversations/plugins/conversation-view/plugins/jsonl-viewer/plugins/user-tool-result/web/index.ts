import type { PluginDefinition } from "@core";
import { JsonlViewer } from "../../../web/slots";
import { UserToolResultRow } from "./components/user-tool-result-row";

export default {
  id: "conversation-jsonl-viewer-user-tool-result",
  name: "JSONL Viewer: Tool result renderer",
  description: "Renders user tool-result events in the JSONL viewer.",
  contributions: [
    JsonlViewer.EventRenderer({ kind: "user-tool-result", component: UserToolResultRow }),
  ],
} satisfies PluginDefinition;
