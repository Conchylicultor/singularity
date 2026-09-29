import { Icon } from "@plugins/ui/plugins/icons/web";
import type { IconRef } from "@plugins/ui/plugins/icons/core";
import type { ComponentType } from "react";
import { Center } from "@plugins/primitives/plugins/css/plugins/center/web";
import { Pin } from "@plugins/primitives/plugins/css/plugins/pin/web";
import { rigidClass } from "@plugins/primitives/plugins/css/plugins/rigid/web";
import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";

export interface TabIconProps {
  icon?: IconRef;
  /** Optional per-app attention overlay (e.g. a sync-error dot). Pinned to the
   *  icon's top-right corner — the badge component owns its own visuals/size and
   *  renders `null` when there's nothing to surface. */
  badge?: ComponentType<{ className?: string }>;
}

/**
 * The tab's leading icon, optionally carrying a per-app attention badge — the
 * shared home for the icon+badge pattern reused by every tab variant (chip /
 * underline / connected), exactly as {@link TabCloseButton} is the shared trailing
 * close. Keeping the `Pin` positioning here means the three variants stay
 * identical (`<TabIcon icon badge />`) and the overlay geometry lives in one
 * place.
 *
 * The badge rides the icon (not the label), so it stays visible when a tab
 * collapses to icon-only under overflow. This mirrors the app-rail icon badge;
 * the one deliberate deviation is `outset` (vs the rail's inset): the tab icon is
 * a small, padding-less anchor, so the dot rides just past the corner rather than
 * landing on the glyph. `decorative` makes the badge click-through so it never
 * eats the tab's activate/close/drag.
 *
 * The glyph is a fixed `size-4` (16px), the same box `Button` gives every icon
 * button's glyph — NOT `icon-auto`. The tab's label text size is set on the
 * label leaf only, so an em-relative icon would scale off the strip's inherited
 * 16px and render at 18.4px, visibly bigger than the `+` and the action-bar
 * buttons sharing the same chrome row.
 *
 * The icon is rigid: it is a flex child of the tab's line, so a long label
 * pressing against the tab's `max-w-*` would otherwise shrink the glyph below
 * 16px — long-titled tabs showed smaller icons than short-titled ones. Only the
 * `<Text>` label gives way.
 */
export function TabIcon({ icon, badge: Badge }: TabIconProps) {
  if (!icon) return null;
  if (!Badge)
    return <Icon icon={icon} className={cn("size-4", rigidClass())} />;
  return (
    <Center as="span" className={cn("relative", rigidClass())}>
      <Icon icon={icon} className="size-4" />
      <Pin to="top-right" offset="2xs" outset decorative>
        <Badge />
      </Pin>
    </Center>
  );
}
