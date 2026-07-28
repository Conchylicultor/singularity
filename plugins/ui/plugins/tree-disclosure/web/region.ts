import { defineVariantRegionWeb } from "@plugins/ui/plugins/variant-region/web";
import { treeDisclosure } from "../core";

/**
 * The web half of the tree-disclosure region. `TreeDisclosure.Variant` is the
 * slot each variant sub-plugin (merged / dimmed-leaf / column) contributes to;
 * `treeDisclosureWeb.Region` is the host contributed into `Tree.Disclosure`.
 */
export const treeDisclosureWeb = defineVariantRegionWeb(treeDisclosure);

export const TreeDisclosure = {
  Variant: treeDisclosureWeb.Variant,
};
