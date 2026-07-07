import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { PageDetail } from "@plugins/apps/plugins/pages/plugins/page-tree/web";
import { BlogPublishPanel } from "./components/blog-publish-panel";

export default {
  description:
    "Pages integration for Blog: an embedded publish panel (slug + summary, Publish/Unpublish, View on site) in the page-detail pane for turning a page into a public blog post.",
  contributions: [
    PageDetail.Section({ id: "blog", component: BlogPublishPanel }),
  ],
} satisfies PluginDefinition;
