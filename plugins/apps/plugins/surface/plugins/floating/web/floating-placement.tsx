import { useCallback, useEffect, useLayoutEffect, useMemo } from "react";
import { MdWebAsset } from "react-icons/md";
import { Apps, useTabs } from "@plugins/apps/web";
import {
  usePlacementStyle,
  type PlacementChromeProps,
  type PlacementDef,
} from "@plugins/apps/plugins/surface/web";
import {
  mergeTabIntoWindow,
  pruneWindows,
  reorderMember,
  setActiveMember,
  splitTabToNewWindow,
  toggleWindowPin,
  useFloatingWindows,
  useTabWindow,
} from "./hooks/use-floating-windows";
import { WindowChrome, WINDOW_TITLEBAR_INSET } from "./components/window-chrome";
import {
  type TabDragCommit,
  type WindowMember,
} from "./components/window-tab-strip";
import { type MergeTarget } from "./components/window-system-menu";
import { DesktopWallpaper } from "./components/desktop-wallpaper";
import { FloatingForeground } from "./components/floating-foreground";
import { useFloatingWindowStyle } from "./hooks/use-window-motion";

/**
 * The floating placement: a free-floating, draggable/resizable window over the
 * desktop wallpaper backdrop. Its geometry box lives entirely in this plugin (the
 * window store) and is pushed onto the shared host container via the keep-alive
 * style channel — so the generic surface body never knows about windows.
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
  Foreground: FloatingForeground,
  Chrome: FloatingChrome,
};

/**
 * Floating window chrome — one instance per floating *tab*. It resolves the
 * {@link FloatingWindow} holding this tab via {@link useTabWindow} and pushes the
 * window's derived box + titlebar inset onto the host-owned stable container
 * through {@link usePlacementStyle}, clearing them on unmount so a dock / solo
 * transition falls back to the host's static defaults (keep-alive).
 *
 * A window can hold several member tabs (browser-style grouping); only the
 * ACTIVE member paints the visible box and renders the `WindowChrome` titlebar.
 * Inactive members push `display:none` so they stay mounted but hidden — there is
 * exactly one titlebar per window. Geometry, snap, pin, minimize all operate on
 * the window (shared by every member). Merge / split are pure store mutations
 * driven from the titlebar's system menu (Phase 1).
 *
 * Focus-on-pointerdown is owned by the host; this only ADDS raise-to-front via
 * the registered pointer-down-capture handler.
 */
function FloatingChrome({ tabId, focused }: PlacementChromeProps) {
  const { window: win, isActive, setGeo, bringToFront } = useTabWindow(tabId);
  const windows = useFloatingWindows();
  const { tabs, titles, focusTab, closeTab } = useTabs();
  const apps = Apps.App.useContributions();
  const { setContainerStyle, setContentInsetStyle, setContainerPointerDownCapture } =
    usePlacementStyle();

  // Drop members whose tab is no longer open + delete empty windows, so a closed
  // window's box doesn't linger in the store. Runs from any mounted floating
  // window keyed on the open-tab id set — the only context where windows matter.
  const openIds = useMemo(() => tabs.map((t) => t.tabId).join(","), [tabs]);
  useEffect(() => {
    pruneWindows(new Set(tabs.map((t) => t.tabId)));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the id set, not the tab objects
  }, [openIds]);

  // When this tab becomes globally focused but isn't its window's active member
  // (focus arrived from cycle / dock / a fresh tab), make it the shown member so
  // the window's model stays consistent with the host focus.
  useEffect(() => {
    if (focused && !isActive) setActiveMember(win.id, tabId);
  }, [focused, isActive, win.id, tabId]);

  // The animated window box → the stable container. The motion layer derives the
  // box (snap / maximize / free) plus the open / minimize / restore tweens and a
  // box `transition` (suppressed mid-drag). Inactive members and minimized windows
  // resolve to `hidden` (display:none) but stay mounted (keep-alive) — the dock
  // chip is then the only restore target. The visible member clears the titlebar
  // via the content inset.
  const { containerStyle, hidden } = useFloatingWindowStyle(win, isActive);
  const insetStyle = useMemo(
    () => (hidden ? { display: "none" } : { top: WINDOW_TITLEBAR_INSET }),
    [hidden],
  );
  useLayoutEffect(() => {
    setContainerStyle(containerStyle);
    setContentInsetStyle(insetStyle);
    return () => {
      // Cleanup: clear the pushed style so docked / solo fall back to defaults.
      setContainerStyle(null);
      setContentInsetStyle(null);
    };
  }, [containerStyle, insetStyle, setContainerStyle, setContentInsetStyle]);

  // Raise this window above others on any pointer-down inside it. The host wires
  // its own focus first; we only add the z-bump.
  useLayoutEffect(() => {
    setContainerPointerDownCapture(() => bringToFront());
    return () => setContainerPointerDownCapture(null);
  }, [setContainerPointerDownCapture, bringToFront]);

  const togglePin = useCallback(() => toggleWindowPin(win.id), [win.id]);

  // Inactive members render no chrome (one titlebar per window). Their container
  // is display:none anyway, so they paint nothing.
  // Resolve the strip's member rows (title + app icon) and the merge targets
  // (every OTHER window, labelled by its active member). Done ONLY for the active
  // member, since only it renders the titlebar.
  const tabAppId = useMemo(() => {
    const m = new Map<string, string>();
    for (const t of tabs) m.set(t.tabId, t.appId);
    return m;
  }, [tabs]);

  const memberRows = useMemo<WindowMember[]>(
    () =>
      win.members.map((memberId) => {
        const appId = tabAppId.get(memberId);
        const app = apps.find((a) => a.id === appId);
        return {
          tabId: memberId,
          title: titles[memberId] ?? app?.tooltip ?? "Window",
          icon: app?.icon,
        };
      }),
    [win.members, tabAppId, apps, titles],
  );

  const mergeTargets = useMemo<MergeTarget[]>(() => {
    const out: MergeTarget[] = [];
    for (const other of windows.values()) {
      if (other.id === win.id) continue;
      const appId = tabAppId.get(other.activeTabId);
      const app = apps.find((a) => a.id === appId);
      out.push({
        id: other.id,
        title: titles[other.activeTabId] ?? app?.tooltip ?? "Window",
      });
    }
    return out;
  }, [windows, win.id, tabAppId, apps, titles]);

  const onSelectMember = useCallback(
    (memberId: string) => {
      setActiveMember(win.id, memberId);
      focusTab(memberId);
    },
    [win.id, focusTab],
  );

  const onCloseWindow = useCallback(() => {
    // Close every member; pruneWindows then deletes the now-empty window.
    for (const memberId of win.members) closeTab(memberId);
  }, [win.members, closeTab]);

  const onMergeInto = useCallback(
    (targetWindowId: string) => mergeTabIntoWindow(win.activeTabId, targetWindowId),
    [win.activeTabId],
  );

  const onSplit = useCallback(
    () => splitTabToNewWindow(win.activeTabId),
    [win.activeTabId],
  );

  // Commit ops for a finished tab-chip drag. reorder/merge mutate the strip;
  // split tears off at the drop point. Each ends by focusing the moved tab so it
  // is shown + focused in its new home (merge/split already set it active in the
  // store; focusTab brings the host focus along so the titlebar reads focused).
  const dragCommit = useMemo<TabDragCommit>(
    () => ({
      reorder: (tabId, index) => {
        reorderMember(win.id, tabId, index);
      },
      merge: (tabId, targetWindowId, index) => {
        mergeTabIntoWindow(tabId, targetWindowId, index);
        focusTab(tabId);
      },
      split: (tabId, point) => {
        splitTabToNewWindow(tabId, point);
        focusTab(tabId);
      },
    }),
    [win.id, focusTab],
  );

  if (!isActive) return null;

  return (
    <WindowChrome
      window={win}
      focused={focused}
      setGeo={setGeo}
      members={memberRows}
      onSelectMember={onSelectMember}
      onCloseMember={closeTab}
      onCloseWindow={onCloseWindow}
      onTogglePin={togglePin}
      mergeTargets={mergeTargets}
      onMergeInto={onMergeInto}
      onSplit={onSplit}
      dragCommit={dragCommit}
    />
  );
}
