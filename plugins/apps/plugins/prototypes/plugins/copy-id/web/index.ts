import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { prototypeDetailPane } from "@plugins/apps/plugins/prototypes/plugins/gallery/web";
import { CopyIdAction } from "./components/copy-id-action";

export default {
  description:
    "Copy prototype ID button in the prototype detail header: copies the open prototype's id (its minted folder name) to the clipboard.",
  contributions: [
    prototypeDetailPane.Actions({ id: "copy-id", component: CopyIdAction }),
  ],
} satisfies PluginDefinition;
