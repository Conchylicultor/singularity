import { useEffect, useLayoutEffect, useMemo, type CSSProperties } from "react";
import { MdWebAsset } from "react-icons/md";
import { useTabs } from "@plugins/apps/web";
import {
  usePlacementStyle,
  type PlacementChromeProps,
  type PlacementDef,
} from "@plugins/apps/plugins/surface/web";
import {
  pruneWindowGeometry,
  useWindowGeometry,
} from "./hooks/use-window-geometry";
import { WindowChrome, WINDOW_TITLEBAR_INSET } from "./components/window-chrome";
import { DesktopWallpaper } from "./components/desktop-wallpaper";
import { WindowDock } from "./components/window-dock";

/**
 * The floating placement: a free-floating, draggable/resizable window over the
 * desktop wallpaper backdrop. Its geometry box lives entirely in this plugin (the
 * `useWindowGeometry` store) and is pushed onto the shared host container via the
 * keep-alive style channel — so the generic surface body never knows about
 * windows.
 */
export const floatingDef: PlacementDef = {
  id: "floating",
  label: "Float as window",
  icon: MdWebAsset,
  order: 1,
  visibleWhenUnfocused: true,
  tearOffTarget: true,
  newTabFollows: true,
  containerClassName:
    "absolute overflow-hidden rounded-lg border bg-background shadow-lg",
  Backdrop: DesktopWallpaper,
  Foreground: WindowDock,
  Chrome: FloatingChrome,
};

/**
 * Floating window chrome. Owns the per-tab geometry via {@link useWindowGeometry}
 * and pushes the derived box + titlebar inset onto the host-owned stable
 * container through {@link usePlacementStyle}, clearing them on unmount so a
 * dock / solo transition falls back to the host's static defaults (keep-alive).
 * Renders the draggable titlebar + resize handles as a sibling overlay of the
 * keep-alive `TabSurface`.
 *
 * Focus-on-pointerdown is owned by the host; this only ADDS raise-to-front via
 * the registered pointer-down-capture handler.
 */
function FloatingChrome({ tabId, appId, title, focused, onClose }: PlacementChromeProps) {
  const [geo, setGeo, bringToFront] = useWindowGeometry(tabId);
  const { setContainerStyle, setContentInsetStyle, setContainerPointerDownCapture } =
    usePlacementStyle();

  // Drop geometry for windows whose tab is no longer open, so a closed window's
  // box doesn't linger in the per-tab store (and re-appear if a new window reuses
  // its slot). Runs from any mounted floating window keyed on the open-tab id set
  // — the only context in which window geometry is meaningful.
  const { tabs } = useTabs();
  const openIds = useMemo(() => tabs.map((t) => t.tabId).join(","), [tabs]);
  useEffect(() => {
    pruneWindowGeometry(new Set(tabs.map((t) => t.tabId)));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the id set, not the tab objects
  }, [openIds]);

  // The window box → the stable container (maximized fills the backdrop). When
  // minimized the WHOLE window (box + titlebar overlay) leaves the desktop via
  // `display:none` on the container — the dock chip is then the only restore
  // target — while the tab stays mounted (keep-alive). Otherwise the content
  // inset clears the titlebar.
  useLayoutEffect(() => {
    const box: CSSProperties = geo.maximized
      ? { left: 0, top: 0, right: 0, bottom: 0, zIndex: geo.z }
      : { left: geo.x, top: geo.y, width: geo.w, height: geo.h, zIndex: geo.z };
    setContainerStyle(geo.minimized ? { ...box, display: "none" } : box);
    setContentInsetStyle(
      geo.minimized ? { display: "none" } : { top: WINDOW_TITLEBAR_INSET },
    );
    return () => {
      // Cleanup: clear the pushed style so docked / solo fall back to defaults.
      setContainerStyle(null);
      setContentInsetStyle(null);
    };
  }, [geo, setContainerStyle, setContentInsetStyle]);

  // Raise this window above others on any pointer-down inside it. The host wires
  // its own focus first; we only add the z-bump.
  useLayoutEffect(() => {
    setContainerPointerDownCapture(() => bringToFront());
    return () => setContainerPointerDownCapture(null);
  }, [setContainerPointerDownCapture, bringToFront]);

  return (
    <WindowChrome
      appId={appId}
      title={title}
      focused={focused}
      geo={geo}
      setGeo={setGeo}
      onClose={onClose}
    />
  );
}
