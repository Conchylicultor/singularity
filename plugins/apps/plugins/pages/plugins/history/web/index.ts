import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { pageDetailPane } from "@plugins/apps/plugins/pages/plugins/page-tree/web";
import { EditedHistoryAction } from "./components/edited-history-action";

export default {
  description:
    'Pages version-history UI: contributes the "Edited 2h ago" label to the page-detail title bar, which opens the reusable version-history dialog with a faithful, diffed read-only preview of each page version.',
  contributions: [
    pageDetailPane.Actions({ id: "edited", component: EditedHistoryAction }),
  ],
} satisfies PluginDefinition;
