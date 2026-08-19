import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Apps } from "@plugins/apps-core/web";
import { MdFolder } from "react-icons/md";
import { mdAppIcon } from "@plugins/apps-core/plugins/app-icon/web";
import { fileExplorerApp } from "../core";
import { FileExplorerLayout } from "./components/file-explorer-layout";
import { FileExplorer } from "./slots";

export { FileExplorer } from "./slots";

export default {
  description:
    "App shell for the file explorer. Registers the /files app entry and defines FileExplorer.Sidebar/Toolbar slots.",
  contributions: [
    Apps.App({
      app: fileExplorerApp,
      icon: mdAppIcon(MdFolder),
      component: FileExplorerLayout,
    }),
  ],
  slots: FileExplorer,
} satisfies PluginDefinition;
