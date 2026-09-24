import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Conversation } from "@plugins/conversations/plugins/conversation-view/plugins/header/web";
import { AllowMonitorChip } from "./components/allow-monitor-chip";

export default {
  description:
    "Flags when an agent has created a guard-bypass file (.allow-main, .allow-postgres, …) in its worktree.",
  contributions: [
    Conversation.Header({ id: "allow-monitor", component: AllowMonitorChip }),
  ],
} satisfies PluginDefinition;
