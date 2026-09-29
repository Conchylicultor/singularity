import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Conversation } from "@plugins/conversations/plugins/conversation-view/web";
import { Item } from "@plugins/conversations/plugins/conversation-ui/plugins/item/web";
import { OpStatusBanner } from "./components/op-status-banner";
import { OpStatusChip } from "./components/op-status-chip";

export default {
  description:
    "Banner above the prompt input showing the worktree's in-flight op (build / push / check / test / e2e) from the op-store in-flight collection: the wait it is parked in (reason, requeue cycle, its own clock) or the work it is doing, total elapsed and the waited / worked split, expandable into the global push queue and every other in-flight op. Also a sidebar row chip flagging the same op (hourglass while parked in a wait).",
  contributions: [
    Conversation.AbovePromptInput({
      id: "op-status",
      component: OpStatusBanner,
    }),
    Item.Chips({ id: "op-status", component: OpStatusChip }),
  ],
} satisfies PluginDefinition;
