import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { JsonlViewer } from "./slots";
import { RawJsonAction } from "./components/raw-json-button";
import { TimestampAction } from "./components/timestamp-action";

export { JsonlViewer } from "./slots";
export type { OverlayContribution, RowActionContribution, EventFilterContribution } from "./slots";
export { JsonlPane } from "./components/jsonl-pane";
export { useRowMarkdown } from "./components/row-markdown-context";
export { useLastAssistantEvent } from "./components/last-assistant-context";
export { useJsonlConversationId } from "./components/conversation-id-context";
export { RowActionButton } from "./components/row-action-button";
export { CopyTextAction } from "./components/copy-button";
export { formatTime } from "./utils";
export { Timestamp } from "./components/timestamp";
export { useStickyReport } from "./components/section-sticky-context";

export default {
  description:
    "Renders the raw Claude JSONL session log as the conversation's main content. Hosts the JsonlViewer.EventRenderer slot for child plugins to render specific event kinds.",
  contributions: [
    JsonlViewer.RowAction({ id: "timestamp", component: TimestampAction }),
    JsonlViewer.RowAction({ id: "raw-json", component: RawJsonAction }),
  ],
} satisfies PluginDefinition;
