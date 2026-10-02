import { defineVariantRegion } from "@plugins/ui/plugins/variant-region/core";
import type { TreeDisclosureProps } from "@plugins/primitives/plugins/tree/core";

/**
 * The tree-disclosure region: swaps how an icon-bearing tree row presents its
 * identity icon and its expand/collapse affordance.
 *
 * Per-app scope: an app whose design names a disclosure (Pages: merged, the
 * file explorer: column) commits it under `config/ui/tree-disclosure/@app/<id>/`;
 * every other app follows the base pick.
 *
 * Defaults to `merged` until the user picks another in the theme customizer.
 */
export const treeDisclosure = defineVariantRegion<TreeDisclosureProps>({
  id: "tree-disclosure",
  label: "Tree disclosure",
  defaultVariant: "merged",
  scope: "app",
});
