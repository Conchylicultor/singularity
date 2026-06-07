import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { MdLibraryBooks } from "react-icons/md";
import { Pane, openPane } from "@plugins/primitives/plugins/pane/web";
import { sidebarNavItem } from "@plugins/primitives/plugins/app-shell/web";
import { Forge } from "@plugins/apps/plugins/forge/plugins/shell/web";
import { catalogPane } from "./panes";

export { PluginChip } from "./components/plugin-chip";
export { Catalog } from "./slots";
export type { CatalogFacetTable, FacetTableEntry } from "./facet-table";
export { defineFacetTable } from "./facet-table";

export default {
  name: "Forge: Catalog",
  description:
    "Central view of all plugin contributions aggregated by type.",
  contributions: [
    Pane.Register({ pane: catalogPane }),
    Forge.Sidebar({
      id: "catalog",
      ...sidebarNavItem({
        title: "Catalog",
        icon: MdLibraryBooks,
        onClick: () => openPane(catalogPane, {}, { mode: "root" }),
      }),
    }),
  ],
} satisfies PluginDefinition;
