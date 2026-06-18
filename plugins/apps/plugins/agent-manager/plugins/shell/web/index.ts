import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Apps } from "@plugins/apps/web";
import { MdChatBubble } from "react-icons/md";
import { AgentManagerLayout } from "./components/agent-manager-layout";

export default {
  description:
    "App shell for the agent manager. Registers the /agents app entry and renders the main Shell layout.",
  contributions: [
    Apps.App({
      id: "agent-manager",
      icon: MdChatBubble,
      tooltip: "Agent Manager",
      component: AgentManagerLayout,
      path: "/agents",
    }),
  ],
} satisfies PluginDefinition;
