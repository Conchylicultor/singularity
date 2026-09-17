import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { PageDetail } from "@plugins/apps/plugins/pages/plugins/page-tree/web";
import { PageKindControl } from "./components/page-kind-control";

export default {
  description:
    "Page-kind control in the page-detail header: its icon names what the open page is to agents — an ordinary page, an agent page (agents may write all of it) or an instructions page (the human's standing instructions to agents working under the parent page) — and its panel changes the kind, with a Global switch on an instructions page.",
  contributions: [
    PageDetail.HeaderActions({
      // Still `page-author`, the id it shipped with: reorder's persisted
      // directives for the header strip are keyed by `<pluginId>:<id>`, so a new
      // id (or a moved plugin folder) would silently drop the button's place.
      id: "page-author",
      component: PageKindControl,
    }),
  ],
} satisfies PluginDefinition;
