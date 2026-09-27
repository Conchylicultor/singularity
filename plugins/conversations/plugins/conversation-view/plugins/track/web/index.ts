import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { TrackChip } from "./components/track-chip";

export default {
  description:
    "Displays the conversation's task track (Main / Sidequest) as a chip in the conversation header.",
  contributions: [
    conversationPane.Actions({ id: "track", component: TrackChip }),
  ],
} satisfies PluginDefinition;
