import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { JsonlRowActions } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/row-actions/web";
import { ForkSessionAction } from "./components/fork-session-action";

export default {
  description:
    "Toolbar buttons (+Sonnet / +Opus) that fork the current conversation via `claude --resume <id> --fork-session`.",
  contributions: [
    JsonlRowActions.Item({ id: "fork-session", component: ForkSessionAction }),
  ],
} satisfies PluginDefinition;
