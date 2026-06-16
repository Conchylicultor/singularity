import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { PageDetail } from "@plugins/apps/plugins/pages/plugins/page-tree/web";
import { VersionHistoryAction } from "./components/version-history-action";

export default {
  description:
    "Pages version-history UI: contributes the Version history header button to the page-detail pane, opening the reusable version-history dialog with a faithful, diffed read-only preview of each page version.",
  contributions: [
    PageDetail.HeaderActions({ id: "history", component: VersionHistoryAction }),
  ],
} satisfies PluginDefinition;
