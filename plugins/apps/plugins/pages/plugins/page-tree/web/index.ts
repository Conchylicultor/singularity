import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { MdDescription } from "react-icons/md";
import { Pane } from "@plugins/primitives/plugins/pane/web";
import { Pages } from "@plugins/apps/plugins/pages/plugins/shell/web";
import { blockDetailPane, pageDetailPane, pagesTreePane } from "./panes";
import { PagesSidebar } from "./components/pages-sidebar";
import {
  BacklinksSection,
  useHasBacklinks,
} from "./components/backlinks-section";
import { DeletePageAction } from "./components/delete-page-action";
import { AddPageBelowAction } from "./components/add-page-below-action";
import { PageDetail, PageTree } from "./slots";

export { PageDetail, PageTree } from "./slots";
export { blockDetailPane, pageDetailPane, pagesTreePane } from "./panes";
export {
  useBlockTarget,
  useBlockTargetTitle,
  useBlockTypeLabel,
  useOpenBlockTarget,
  type BlockTarget,
} from "./internal/block-target";
export {
  createPageWithSeed,
  type PageSeedBlock,
} from "./internal/create-page-with-seed";

export default {
  description:
    "Sidebar page-tree plus the page-detail pane (header, editor, sections slot) and the block-detail pane (one block of a page, opened as a page of its own) for the Pages app, with useBlockTarget — the one resolver of a bare block id to the pane that shows it.",
  contributions: [
    Pane.Register({ pane: pageDetailPane }),
    Pane.Register({ pane: blockDetailPane }),
    Pane.Register({ pane: pagesTreePane }),
    Pages.Sidebar({
      id: "pages",
      title: "Pages",
      icon: MdDescription,
      component: PagesSidebar,
    }),
    PageDetail.Section({
      id: "backlinks",
      label: "Linked from",
      component: BacklinksSection,
      useAvailable: useHasBacklinks,
    }),
    PageTree.RowActions({ id: "delete", component: DeletePageAction }),
    PageTree.RowActions({ id: "add-below", component: AddPageBelowAction }),
  ],
  slots: {
    ...PageDetail,
    ...PageTree,
    "page-detail": pageDetailPane,
    "block-detail": blockDetailPane,
    "pages-tree": pagesTreePane,
  },
} satisfies PluginDefinition;
