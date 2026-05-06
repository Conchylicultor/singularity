import type { PluginDefinition } from "@core";
import { Apps } from "@plugins/apps/web";
import { MdDashboard } from "react-icons/md";
import { AgentManagerLayout } from "./components/agent-manager-layout";

export default {
  id: "agent-manager-shell",
  name: "Agent Manager: Shell",
  description:
    "App shell for the agent manager. Registers the / app entry and renders the main Shell layout.",
  contributions: [
    Apps.App({
      id: "agent-manager",
      icon: MdDashboard,
      tooltip: "Agent Manager",
      component: AgentManagerLayout,
      path: "/",
    }),
  ],
} satisfies PluginDefinition;
