import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { MdGrade } from "react-icons/md";
import { Pages } from "@plugins/apps/plugins/pages/plugins/shell/web";
import { PageTree, PageDetail } from "@plugins/apps/plugins/pages/plugins/page-tree/web";
import { FavoritesSidebar } from "./components/favorites-sidebar";
import { StarRowAction } from "./components/star-row-action";
import { StarHeaderAction } from "./components/star-header-action";

export { starredPagesResource, StarredPageRowSchema } from "../shared/resources";
export type { StarredPageRow } from "../shared/resources";

export default {
  description:
    "Favorites/starred pages for the Pages app: a Favorites sidebar section plus star toggles on page-tree rows and the page header.",
  contributions: [
    Pages.Sidebar({
      id: "favorites",
      title: "Favorites",
      icon: MdGrade,
      component: FavoritesSidebar,
    }),
    PageTree.RowActions({ id: "star", component: StarRowAction }),
    PageDetail.HeaderActions({ id: "star", component: StarHeaderAction }),
  ],
} satisfies PluginDefinition;
