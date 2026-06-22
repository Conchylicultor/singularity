import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Apps } from "@plugins/apps/web";
import { MdFolder } from "react-icons/md";
import { fileExplorerApp } from "../core";
import { FileExplorerLayout } from "./components/file-explorer-layout";

export { FileExplorer } from "./slots";

export default {
  description:
    "App shell for the file explorer. Registers the /files app entry and defines FileExplorer.Sidebar/Toolbar slots.",
  contributions: [
    Apps.App({
      id: fileExplorerApp.id,
      icon: MdFolder,
      tooltip: "File Explorer",
      component: FileExplorerLayout,
      path: fileExplorerApp.basePath,
    }),
  ],
} satisfies PluginDefinition;
