import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { PageDetail } from "@plugins/apps/plugins/pages/plugins/page-tree/web";
import { CopyIdAction } from "./components/copy-id-action";

export default {
  description:
    "Copy block ID button in the page-detail header: copies the open page's block id (the id agents' page tools take) to the clipboard.",
  contributions: [
    PageDetail.HeaderActions({ id: "copy-id", component: CopyIdAction }),
  ],
} satisfies PluginDefinition;
