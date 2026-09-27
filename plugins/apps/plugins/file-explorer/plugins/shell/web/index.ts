import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Apps } from "@plugins/apps-core/web";

import { appIcon } from "@plugins/apps-core/plugins/app-icon/core";
import { fileExplorerApp } from "../core";
import { FileExplorerLayout } from "./components/file-explorer-layout";
import { FileExplorer } from "./slots";
import { symbol } from "@plugins/ui/plugins/icons/core";

export { FileExplorer } from "./slots";

export default {
  description:
    "App shell for the file explorer. Registers the /files app entry and defines FileExplorer.Sidebar/Toolbar slots.",
  contributions: [
    Apps.App({
      app: fileExplorerApp,
      icon: appIcon(symbol("folder")),
      component: FileExplorerLayout,
    }),
  ],
  slots: FileExplorer,
} satisfies PluginDefinition;
