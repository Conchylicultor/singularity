import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { pageDetailPane } from "@plugins/apps/plugins/pages/plugins/page-tree/web";
import { CopyIdAction } from "./components/copy-id-action";

export default {
  description:
    "Copy block ID button next to the title in the page-detail header: copies the open page's block id (the id agents' page tools take) to the clipboard.",
  contributions: [
    pageDetailPane.Actions({ id: "copy-id", component: CopyIdAction }),
  ],
} satisfies PluginDefinition;
