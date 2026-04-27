import type { PluginDefinition } from "@core";

export { JsonlViewer } from "./slots";
export type { EventRendererContribution } from "./slots";
export { JsonlPane } from "./components/jsonl-pane";

export default {
  id: "conversation-jsonl-viewer",
  name: "Conversation: JSONL viewer",
  description:
    "Renders the raw Claude JSONL session log as the conversation's main content. Hosts the JsonlViewer.EventRenderer slot for child plugins to render specific event kinds.",
  contributions: [],
} satisfies PluginDefinition;
