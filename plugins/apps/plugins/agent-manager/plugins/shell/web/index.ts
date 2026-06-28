import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Apps } from "@plugins/apps-core/web";
import { MdChatBubble } from "react-icons/md";
import { agentManagerApp } from "../core";
import { AgentManagerLayout } from "./components/agent-manager-layout";

export default {
  description:
    "App shell for the agent manager. Registers the /agents app entry and renders the main Shell layout.",
  contributions: [
    Apps.App({
      id: agentManagerApp.id,
      icon: MdChatBubble,
      tooltip: "Agent Manager",
      component: AgentManagerLayout,
      path: agentManagerApp.basePath,
    }),
  ],
} satisfies PluginDefinition;
