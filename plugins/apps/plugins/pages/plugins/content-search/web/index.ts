import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Pages } from "@plugins/apps/plugins/pages/plugins/shell/web";
import { PagesSearch } from "./components/pages-search";
import { symbol } from "@plugins/ui/plugins/icons/core";

export default {
  description:
    "Pages full-text search consumer: contributes the Search button into the Pages sidebar, opening the reusable quick-find dialog scoped to the pages source.",
  contributions: [
    Pages.Sidebar({
      id: "search",
      title: "Search",
      icon: symbol("search"),
      component: PagesSearch,
    }),
  ],
} satisfies PluginDefinition;
