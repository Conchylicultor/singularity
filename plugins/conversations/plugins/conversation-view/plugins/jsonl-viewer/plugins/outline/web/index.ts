import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { JsonlViewer } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/web";
import { ConversationOutline } from "./components/outline";

export default {
  description:
    "The transcript's outline: one dash per user turn pinned to the right edge of the conversation, the current turn highlighted, expanding on hover into a clickable list of turns. An adapter over the outline rail primitive — this plugin owns only which turns exist and how a turn maps to its row.",
  contributions: [
    JsonlViewer.Overlay({ id: "outline", component: ConversationOutline }),
  ],
} satisfies PluginDefinition;
