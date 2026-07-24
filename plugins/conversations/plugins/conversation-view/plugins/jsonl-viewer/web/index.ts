import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { JsonlRowActions } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/row-actions/web";
import { RawJsonAction } from "./components/raw-json-button";
import { TimestampAction } from "./components/timestamp-action";

export { JsonlViewer } from "./slots";
export type { OverlayContribution, EventFilterContribution } from "./slots";
export { JsonlPane } from "./components/jsonl-pane";
export { EventLine } from "./components/event-line";
export { useRowMarkdown } from "./components/row-markdown-context";
export { useLastAssistantEvent } from "./components/last-assistant-context";
export { useJsonlConversationId } from "./components/conversation-id-context";
export { formatTime } from "./utils";
export { Timestamp } from "./components/timestamp";
export { useSectionExpand } from "./components/section-sticky-context";
export type { SectionExpand } from "./components/section-sticky-context";

export default {
  description:
    "Renders the raw Claude JSONL session log as the conversation's main content. Hosts the JsonlViewer.EventRenderer slot for child plugins to render specific event kinds.",
  contributions: [
    JsonlRowActions.Item({ id: "timestamp", component: TimestampAction }),
    JsonlRowActions.Item({ id: "raw-json", component: RawJsonAction }),
  ],
} satisfies PluginDefinition;
