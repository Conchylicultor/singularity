import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Conversation } from "@plugins/conversations/plugins/conversation-view/plugins/header/web";
import { AllowMonitorChip } from "./components/allow-monitor-chip";

export default {
  id: "conversation-allow-monitor",
  name: "Conversation: Allow Monitor",
  description:
    "Flags when an agent has created an allow-file (.allow-main, .allow-migrations) to bypass security guards.",
  contributions: [
    Conversation.Header({ id: "allow-monitor", component: AllowMonitorChip }),
  ],
} satisfies PluginDefinition;
