import { defineVariantRegion } from "@plugins/ui/plugins/variant-region/core";
import type { TreeDisclosureProps } from "@plugins/primitives/plugins/tree/core";

/**
 * The tree-disclosure region: swaps how an icon-bearing tree row presents its
 * identity icon and its expand/collapse affordance.
 *
 * Global scope (not per-app): a tree row looks the same in every app that
 * renders one (tasks, pages, story, the page editor), and legibility of "does
 * this row have children" is a single user-level preference, not app chrome.
 *
 * Defaults to `merged` — pixel-identical to today's row — until the user picks
 * another in the theme customizer.
 */
export const treeDisclosure = defineVariantRegion<TreeDisclosureProps>({
  id: "tree-disclosure",
  label: "Tree disclosure",
  defaultVariant: "merged",
});
