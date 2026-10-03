import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Apps } from "@plugins/apps-core/web";

import { appIcon } from "@plugins/apps-core/plugins/app-icon/core";
import { fileExplorerApp } from "../core";
import { FileExplorerLayout } from "./components/file-explorer-layout";
import { FileExplorer } from "./slots";
import { symbol } from "@plugins/ui/plugins/icons/core";

export {
  FileExplorer,
  type Place,
  type PlaceGroup,
  type PlacesSource,
  type PlacesState,
} from "./slots";

export default {
  description:
    "App shell for the file explorer: registers the /files app entry, lays the Places sidebar beside one full-surface browser pane, and defines the FileExplorer.Sidebar / Toolbar / Places slots.",
  contributions: [
    Apps.App({
      app: fileExplorerApp,
      icon: appIcon(symbol("folder")),
      component: FileExplorerLayout,
    }),
  ],
  slots: FileExplorer,
} satisfies PluginDefinition;
