import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { MdDescription } from "react-icons/md";
import { Pane } from "@plugins/primitives/plugins/pane/web";
import { Pages } from "@plugins/apps/plugins/pages/plugins/shell/web";
import { pageDetailPane } from "./panes";
import { PagesSidebar } from "./components/pages-sidebar";
import { BacklinksSection } from "./components/backlinks-section";
import { DeletePageAction } from "./components/delete-page-action";
import { PageDetail, PageTree } from "./slots";

export { PageDetail, PageTree } from "./slots";
export { pageDetailPane } from "./panes";
export { createPageWithSeed, type PageSeedBlock } from "./internal/create-page-with-seed";

export default {
  description:
    "Sidebar page-tree plus the page-detail pane (header, editor, sections slot) for the Pages app.",
  contributions: [
    Pane.Register({ pane: pageDetailPane }),
    Pages.Sidebar({
      id: "pages",
      title: "Pages",
      icon: MdDescription,
      component: PagesSidebar,
    }),
    PageDetail.Section({ id: "backlinks", component: BacklinksSection }),
    PageTree.RowActions({ id: "delete", component: DeletePageAction }),
  ],
} satisfies PluginDefinition;
