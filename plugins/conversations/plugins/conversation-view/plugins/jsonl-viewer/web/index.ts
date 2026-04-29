import type { PluginDefinition } from "@core";
import { JsonlViewer } from "./slots";
import { RawJsonAction } from "./components/raw-json-button";

export { JsonlViewer } from "./slots";
export type { EventRendererContribution, RowActionContribution } from "./slots";
export { JsonlPane } from "./components/jsonl-pane";
export { useRowMarkdown } from "./components/row-markdown-context";
export { TokenBadge } from "./components/token-badge";
export { CopyTextAction } from "./components/copy-button";
export { formatTime } from "./utils";

export default {
  id: "conversation-jsonl-viewer",
  name: "Conversation: JSONL viewer",
  description:
    "Renders the raw Claude JSONL session log as the conversation's main content. Hosts the JsonlViewer.EventRenderer slot for child plugins to render specific event kinds.",
  contributions: [
    JsonlViewer.RowAction({ id: "raw-json", component: RawJsonAction }),
  ],
} satisfies PluginDefinition;
