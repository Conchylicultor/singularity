import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Apps } from "@plugins/apps-core/web";
import { MdBugReport } from "react-icons/md";
import { mdAppIcon } from "@plugins/apps-core/plugins/app-icon/web";
import { debugApp } from "../core";
import { DebugLayout } from "./components/debug-layout";

export { DebugApp } from "./slots";

export default {
  description:
    "App shell for the debug tools. Registers the /debug app entry and defines DebugApp.Sidebar/Toolbar slots.",
  contributions: [
    Apps.App({
      id: debugApp.id,
      icon: mdAppIcon(MdBugReport),
      tooltip: "Debug",
      component: DebugLayout,
      path: debugApp.basePath,
    }),
  ],
} satisfies PluginDefinition;
