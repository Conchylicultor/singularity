import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { PageTree, PageDetail } from "@plugins/apps/plugins/pages/plugins/page-tree/web";
import { StarredField } from "./components/starred-field";
import { StarRowAction } from "./components/star-row-action";
import { StarHeaderAction } from "./components/star-header-action";

export { starredPagesResource, StarredPageRowSchema } from "../shared/resources";
export type { StarredPageRow } from "../shared/resources";

export default {
  description:
    "Favorites/starred pages for the Pages app: contributes a `starred` bool field into the Pages sidebar DataView (Favorites is a filtered list view) plus star toggles on page-tree rows and the page header.",
  contributions: [
    PageTree.Fields({ id: "starred", component: StarredField }),
    PageTree.RowActions({ id: "star", component: StarRowAction }),
    PageDetail.HeaderActions({ id: "star", component: StarHeaderAction }),
  ],
} satisfies PluginDefinition;
