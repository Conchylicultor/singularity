import type { PluginDefinition } from "@core";
import { Shell } from "@plugins/shell/web/slots";
import { MdBugReport } from "react-icons/md";
import { DebugSidebar } from "./components/debug-sidebar";

const debugPlugin: PluginDefinition = {
  id: "debug",
  name: "Debug",
  description: "Debug tools sidebar group.",
  contributions: [
    Shell.Sidebar({
      title: "Debug",
      icon: MdBugReport,
      component: DebugSidebar,
    }),
  ],
};

export default debugPlugin;
