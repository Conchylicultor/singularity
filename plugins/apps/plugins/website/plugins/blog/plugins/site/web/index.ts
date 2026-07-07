import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Pane } from "@plugins/primitives/plugins/pane/web";
import { WebsiteToolbar } from "@plugins/apps/plugins/website/plugins/shell/web";
import { blogListPane, blogPostPane } from "./panes";
import { BlogNavItem } from "./components/blog-nav-item";

export { blogListPane, blogPostPane } from "./panes";

export default {
  description:
    "Public blog surfaces for the equin website: the /website/blog list and /website/blog/:slug post panes (page content rendered read-only), plus the Blog nav link in the shared site header.",
  contributions: [
    Pane.Register({ pane: blogListPane }),
    Pane.Register({ pane: blogPostPane }),
    WebsiteToolbar.End({ id: "blog", component: BlogNavItem }),
  ],
} satisfies PluginDefinition;
