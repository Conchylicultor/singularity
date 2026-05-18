import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Pane } from "@plugins/primitives/plugins/pane/web";
import { Conversation } from "@plugins/conversations/plugins/conversation-view/plugins/action-bar/web";
import { ReviewButton } from "./components/review-button";
import { convReviewPane } from "./panes";

export { Review as ReviewSlots } from "./slots";
export { convReviewPane } from "./panes";
export type { Source, ReviewProps } from "./source";

export default {
  id: "review",
  name: "Review",
  description:
    "Toolbar button that opens a side pane exposing agent modifications in a structured, extensible view.",
  contributions: [
    Pane.Register({ pane: convReviewPane }),
    Conversation.ActionBar({ id: "review", component: ReviewButton }),
  ],
} satisfies PluginDefinition;
