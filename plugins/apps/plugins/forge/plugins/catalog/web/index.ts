import type { PluginDefinition } from "@core";
import {
  MdLibraryBooks,
  MdAltRoute,
  MdViewColumn,
  MdExtension,
  MdStorage,
  MdLayers,
} from "react-icons/md";
import { Pane, openPane } from "@plugins/primitives/plugins/pane/web";
import { sidebarNavItem } from "@plugins/primitives/plugins/app-shell/web";
import { Forge } from "@plugins/apps/plugins/forge/plugins/shell/web";
import { catalogPane } from "./panes";
import { Catalog } from "./slots";
import { countFlat } from "./count";
import { RoutesTable } from "./components/categories/routes-table";
import { PanesTable } from "./components/categories/panes-table";
import { SlotsTable } from "./components/categories/slots-table";
import { ResourcesTable } from "./components/categories/resources-table";
import { ContributionsTable } from "./components/categories/contributions-table";

export { Catalog } from "./slots";

export default {
  id: "forge-catalog",
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
        onClick: () => openPane(catalogPane, {}),
      }),
    }),
    Catalog.Category({
      id: "routes",
      label: "Routes",
      icon: MdAltRoute,
      getCount: (plugins) => countFlat(plugins, (p) => p.publicApi?.routes ?? []),
      component: RoutesTable,
    }),
    Catalog.Category({
      id: "panes",
      label: "Panes",
      icon: MdViewColumn,
      getCount: (plugins) =>
        countFlat(plugins, (p) =>
          (p.publicApi?.contributions ?? []).filter((c) => c.slot === "Pane.Register"),
        ),
      component: PanesTable,
    }),
    Catalog.Category({
      id: "slots",
      label: "Slots",
      icon: MdExtension,
      getCount: (plugins) => countFlat(plugins, (p) => p.publicApi?.slots ?? []),
      component: SlotsTable,
    }),
    Catalog.Category({
      id: "resources",
      label: "Resources",
      icon: MdStorage,
      getCount: (plugins) => countFlat(plugins, (p) => p.publicApi?.resources ?? []),
      component: ResourcesTable,
    }),
    Catalog.Category({
      id: "contributions",
      label: "Contributions",
      icon: MdLayers,
      getCount: (plugins) => countFlat(plugins, (p) => p.publicApi?.contributions ?? []),
      component: ContributionsTable,
    }),
  ],
} satisfies PluginDefinition;
