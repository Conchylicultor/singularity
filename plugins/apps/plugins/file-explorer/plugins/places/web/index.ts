import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { FileExplorer } from "@plugins/apps/plugins/file-explorer/plugins/shell/web";
import { symbol } from "@plugins/ui/plugins/icons/core";
import { PlacesSidebar } from "./components/places-sidebar";
import { StorageMeter } from "./components/storage-meter";
import { placeContributions } from "./internal/places";

export default {
  description:
    "The file explorer's Places sidebar: the places of every FileExplorer.Places source (its own: Home, Downloads, the Singularity checkout, the startup volume, Trash) as a DataView list in Favorites / Worktrees / Locations sections with the current folder's place active, and the startup volume's storage meter at its foot.",
  contributions: [
    FileExplorer.Sidebar({
      id: "places",
      title: "Places",
      icon: symbol("folder-special"),
      component: PlacesSidebar,
    }),
    FileExplorer.Sidebar({
      id: "storage",
      title: "Storage",
      icon: symbol("hard-drive"),
      component: StorageMeter,
    }),
    ...placeContributions,
  ],
} satisfies PluginDefinition;
