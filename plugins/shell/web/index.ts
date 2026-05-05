import { type PluginDefinition } from "@core";
import { Apps } from "@plugins/apps/web";
import { MdDashboard } from "react-icons/md";
import { ShellLayout } from "./components/shell-layout";
export { Shell } from "./slots";
export { Shell as ShellCommands, type ToastVariant, type ToastArgs } from "./commands";

export default {
  id: "shell",
  name: "Shell",
  description: "Foundational app layout; defines the slots and commands most other plugins extend.",
  loadBearing: true,
  contributions: [
    Apps.App({
      id: "agent-manager",
      icon: MdDashboard,
      tooltip: "Agent Manager",
      component: ShellLayout,
      path: "/",
    }),
  ],
} satisfies PluginDefinition;
