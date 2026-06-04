import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Conversation } from "@plugins/conversations/plugins/conversation-view/web";
import { OpStatusBanner } from "./components/op-status-banner";

export default {
  name: "Conversation View: Op Status",
  description:
    "Banner above the prompt input showing the worktree's in-flight build/push, with elapsed time and a 'queued / waiting for lock' phase for pushes.",
  contributions: [
    Conversation.AbovePromptInput({ id: "op-status", component: OpStatusBanner }),
  ],
} satisfies PluginDefinition;
