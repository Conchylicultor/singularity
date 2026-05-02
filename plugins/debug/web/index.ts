import type { PluginDefinition } from "@core";
import { Shell } from "@plugins/shell/web";
import { MdBugReport } from "react-icons/md";
import { DebugSidebar } from "./components/debug-sidebar";
export { Debug } from "./slots";

export default {
  id: "debug",
  name: "Debug",
  description: "Debug tools sidebar group.",
  contributions: [
    Shell.Sidebar({
      id: "debug",
      title: "Debug",
      icon: MdBugReport,
      component: DebugSidebar,
    }),
  ],
} satisfies PluginDefinition;
