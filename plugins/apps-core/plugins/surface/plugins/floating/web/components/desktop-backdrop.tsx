import {
  DesktopContextMenu,
  WallpaperAttribution,
} from "@plugins/apps-core/plugins/surface/plugins/floating/plugins/wallpaper/web";
import { DesktopWallpaper } from "./desktop-wallpaper";

/**
 * The floating placement's {@link PlacementDef.Backdrop}: the desktop layer that
 * sits BELOW every window (the surface body renders backdrops before the tab
 * containers). Composes three things, all desktop-level:
 *
 * 1. {@link DesktopWallpaper} — the full-bleed image or default gradient.
 * 2. {@link DesktopContextMenu} — the transparent right-click capture layer.
 *    Living in the backdrop (below windows) is what guarantees a right-click on a
 *    window reaches the window's own system menu, while a right-click on the empty
 *    desktop reaches this menu.
 * 3. {@link WallpaperAttribution} — the unobtrusive corner credit.
 *
 * A full-bleed `relative inset-0` host so the capture layer's `absolute inset-0`
 * and the attribution's corner `Pin` anchor to the desktop, not the surface.
 */
export function DesktopBackdrop() {
  return (
    // eslint-disable-next-line layout/no-adhoc-layout -- full-bleed desktop backdrop host: it IS the absolute desktop layer (positioning context for the capture layer + corner attribution), not an Overlay wrapping content
    <div className="absolute inset-0">
      <DesktopWallpaper />
      <DesktopContextMenu />
      <WallpaperAttribution />
    </div>
  );
}
