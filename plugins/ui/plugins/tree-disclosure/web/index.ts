import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Tree } from "@plugins/primitives/plugins/tree/web";
import { treeDisclosureWeb } from "./region";

export { TreeDisclosure } from "./region";

export default {
  description:
    "Tree-row disclosure region (merged / dimmed-leaf / column). Contributes its variant-region host into Tree.Disclosure.",
  contributions: [
    ...treeDisclosureWeb.contributions,
    Tree.Disclosure({ component: treeDisclosureWeb.Region }),
  ],
  slots: [treeDisclosureWeb],
} satisfies PluginDefinition;
