import type { ComponentType } from "react";
import { Center } from "@plugins/primitives/plugins/css/plugins/center/web";
import { Pin } from "@plugins/primitives/plugins/css/plugins/pin/web";

export interface TabIconProps {
  icon?: ComponentType<{ className?: string }>;
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
 */
export function TabIcon({ icon: Icon, badge: Badge }: TabIconProps) {
  if (!Icon) return null;
  if (!Badge) return <Icon className="icon-auto" />;
  return (
    <Center as="span" className="relative">
      <Icon className="icon-auto" />
      <Pin to="top-right" offset="2xs" outset decorative>
        <Badge />
      </Pin>
    </Center>
  );
}
