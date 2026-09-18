import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { JsonlRowActions } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/row-actions/web";
import { RewindAction } from "./components/rewind-action";

export default {
  description:
    "Row action on each of the user's own messages: go back to just before it, in this conversation (Rewind to here) or in a new one (Fork from here). Warns first about what cannot be brought back.",
  contributions: [
    JsonlRowActions.Item({ id: "rewind", component: RewindAction }),
  ],
} satisfies PluginDefinition;
