import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { PageDetail } from "@plugins/apps/plugins/pages/plugins/page-tree/web";
import { OpenInAppAction } from "./components/open-in-app-action";

export default {
  description:
    "Expand action in the page-detail header, shown only when the page is open outside the Pages app: takes it to Pages in this tab, or in a new one on middle-/⌘-click.",
  contributions: [
    PageDetail.HeaderActions({ id: "open-in-app", component: OpenInAppAction }),
  ],
} satisfies PluginDefinition;
