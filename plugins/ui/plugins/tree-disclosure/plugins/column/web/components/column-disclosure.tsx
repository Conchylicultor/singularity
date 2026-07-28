import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { Center } from "@plugins/primitives/plugins/css/plugins/center/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { TreeDisclosureToggle } from "@plugins/primitives/plugins/tree/web";
import type { TreeDisclosureProps } from "@plugins/primitives/plugins/tree/core";

/**
 * Column disclosure (Finder / VS Code / Figma style) — a dedicated chevron
 * column ahead of the icon, so identity and structure stop sharing a channel.
 *
 * A row with children shows its chevron at rest (dim, full on hover); a
 * childless row shows the column as empty space, keeping every icon on one
 * rail. The icon never disappears under the cursor.
 *
 * This is the same encoding tree's icon-less rows already use — the merged
 * variant is the only place that loses it.
 */
export function ColumnDisclosure({
  icon,
  hasChildren,
  isOpen,
  expandable,
  onToggle,
}: TreeDisclosureProps) {
  return (
    <Stack direction="row" align="center" gap="2xs">
      {hasChildren ? (
        <TreeDisclosureToggle
          isOpen={isOpen}
          onToggle={onToggle}
          className="size-4 opacity-40 group-hover/tree-row:opacity-100"
        />
      ) : expandable ? (
        // A childless row in an editable tree can still gain children by drop,
        // so keep the expand affordance — but only on hover, and muted, so it
        // never competes with a real parent's rest-state chevron.
        <TreeDisclosureToggle
          isOpen={isOpen}
          onToggle={onToggle}
          className={cn(
            "size-4",
            "opacity-0 pointer-events-none group-hover/tree-row:opacity-60 group-hover/tree-row:pointer-events-auto focus-visible:opacity-60 focus-visible:pointer-events-auto",
          )}
        />
      ) : (
        // Read-only leaf: reserve the column's width so icons stay aligned.
        <span className="size-4" aria-hidden />
      )}
      <Center as="span" axis="both" className="size-5">
        {icon}
      </Center>
    </Stack>
  );
}
