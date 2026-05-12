import type { PluginDefinition } from "@core";
import { Apps } from "@plugins/apps/web";
import { MdBugReport } from "react-icons/md";
import { DebugLayout } from "./components/debug-layout";

export { DebugApp } from "./slots";

export default {
  id: "debug-app-shell",
  name: "Debug App: Shell",
  description:
    "App shell for the debug tools. Registers the /debug app entry and defines DebugApp.Sidebar/Toolbar slots.",
  contributions: [
    Apps.App({
      id: "debug",
      icon: MdBugReport,
      tooltip: "Debug",
      component: DebugLayout,
      path: "/debug",
    }),
  ],
} satisfies PluginDefinition;
