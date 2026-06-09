import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Conversation } from "@plugins/conversations/plugins/conversation-view/web";
import { Item } from "@plugins/conversations/plugins/conversation-ui/plugins/item/web";
import { OpStatusBanner } from "./components/op-status-banner";
import { OpStatusChip } from "./components/op-status-chip";

export default {
  description:
    "Banner above the prompt input showing the worktree's in-flight build/push, with elapsed time and a 'queued / waiting for lock' phase for pushes. Also a sidebar row chip flagging the same op (Building / Pushing / Waiting for lock).",
  contributions: [
    Conversation.AbovePromptInput({ id: "op-status", component: OpStatusBanner }),
    Item.Chips({ id: "op-status", component: OpStatusChip }),
  ],
} satisfies PluginDefinition;
