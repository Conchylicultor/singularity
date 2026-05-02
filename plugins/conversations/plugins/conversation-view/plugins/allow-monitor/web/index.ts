import type { PluginDefinition } from "@core";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { AllowMonitorChip } from "./components/allow-monitor-chip";

export default {
  id: "conversation-allow-monitor",
  name: "Conversation: Allow Monitor",
  description:
    "Flags when an agent has created an allow-file (.allow-main, .allow-migrations) to bypass security guards.",
  contributions: [
    conversationPane.Actions({ component: AllowMonitorChip, position: "left" }),
  ],
} satisfies PluginDefinition;
