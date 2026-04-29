import type { PluginDefinition } from "@core";
import { JsonlViewer } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/web";
import { ForkSessionAction } from "./components/fork-session-action";

export default {
  id: "conversation-fork-session",
  name: "Conversation: Fork session",
  description:
    "Toolbar buttons (+Sonnet / +Opus) that fork the current conversation via `claude --resume <id> --fork-session`.",
  contributions: [
    JsonlViewer.RowAction({ id: "fork-session", component: ForkSessionAction }),
  ],
} satisfies PluginDefinition;
