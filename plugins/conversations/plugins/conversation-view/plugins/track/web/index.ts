import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Conversation } from "@plugins/conversations/plugins/conversation-view/plugins/header/web";
import { TrackChip } from "./components/track-chip";

export default {
  description:
    "Displays the conversation's task track (Main / Sidequest) as a chip in the conversation header.",
  contributions: [Conversation.Header({ id: "track", component: TrackChip })],
} satisfies PluginDefinition;
