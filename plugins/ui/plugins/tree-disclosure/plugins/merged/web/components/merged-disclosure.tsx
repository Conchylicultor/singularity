import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { Center } from "@plugins/primitives/plugins/css/plugins/center/web";
import { TreeDisclosureToggle } from "@plugins/primitives/plugins/tree/web";
import type { TreeDisclosureProps } from "@plugins/primitives/plugins/tree/core";

/**
 * Merged disclosure (Notion style) — the identity icon and the chevron share
 * one size-5 box: icon at rest, chevron on row hover. Mirrors tree's inline
 * `DefaultMergedDisclosure` byte-for-byte, so loading this plugin changes
 * nothing until another variant is picked.
 *
 * Trade-off this variant accepts: structure is invisible at rest, and the
 * hover chevron appears on childless rows too. Notion gets away with it
 * because every page there can contain pages; a tree with real leaves cannot
 * distinguish parents from leaves under this variant.
 */
export function MergedDisclosure({
  icon,
  isOpen,
  expandable,
  onToggle,
}: TreeDisclosureProps) {
  return (
    <Center as="span" axis="both" className="relative size-5">
      <Center
        as="span"
        axis="both"
        className={cn(
          expandable &&
            "group-hover/tree-row:opacity-0 group-hover/tree-row:pointer-events-none",
        )}
      >
        {icon}
      </Center>
      {expandable && (
        <TreeDisclosureToggle
          isOpen={isOpen}
          onToggle={onToggle}
          // eslint-disable-next-line layout/no-adhoc-layout -- chevron button overlays the icon slot full-bleed (icon at rest, chevron on hover)
          className={cn(
            "absolute inset-0",
            "opacity-0 pointer-events-none group-hover/tree-row:opacity-100 group-hover/tree-row:pointer-events-auto focus-visible:opacity-100 focus-visible:pointer-events-auto",
          )}
        />
      )}
    </Center>
  );
}
