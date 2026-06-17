import { getFocusedSurfaceId } from "@plugins/primitives/plugins/shortcuts/web";
import {
  bringWindowToFront,
  getFloatingWindow,
  restoreWindow,
  snapWindowDirection,
  toggleWindowPin,
  windowForTab,
} from "./hooks/use-floating-windows";
import type { SnapDirection } from "./hooks/use-snap";

/**
 * Imperative window-management commands driven by the static keyboard shortcuts
 * (registered in this plugin's barrel). The focused window is resolved from the
 * focused *surface* — `getFocusedSurfaceId()` returns the focused tabId (the apps
 * tab model feeds it into the shortcut system on every focus change), which
 * {@link windowForTab} maps to the window currently holding it — so snap /
 * minimize / pin need no window handle and read it directly.
 *
 * Cross-window commands (close, cycle) additionally need the live floating tab
 * order + focus/close callbacks. The load-bearing `apps` plugin exposes those
 * only through the `useTabs()` hook, so a tiny in-tree publisher
 * ({@link setFloatingTabsBridge}, written from the floating Foreground) bridges
 * them to module scope — the same module-channel pattern this plugin already uses
 * for window geometry and the snap preview. There is never more than one floating
 * surface in focus, so a single page-global channel is the right shape.
 */
export interface FloatingTabsBridge {
  /** Open floating tabIds, in tab-strip order (cycle order). */
  tabIds: string[];
  focusTab: (tabId: string) => void;
  closeTab: (tabId: string) => void;
}

// eslint-disable-next-line scoped-store/no-module-mutable-store -- page-global by design: a single bridge for the (single) focused floating surface, mirroring this plugin's module-global geometry + snap-preview channels.
let bridge: FloatingTabsBridge | null = null;

/** Publish (or clear, with `null`) the live tabs bridge from the Foreground. */
export function setFloatingTabsBridge(next: FloatingTabsBridge | null) {
  bridge = next;
}

/** The window currently holding the focused surface (the active member's tab). */
function focusedWindowId(): string | undefined {
  const tabId = getFocusedSurfaceId();
  return tabId ? windowForTab(tabId) : undefined;
}

/** Tile the focused window in a direction (maximize/quarter/restore/minimize). */
export function snapFocusedWindow(dir: SnapDirection) {
  const wid = focusedWindowId();
  if (wid) snapWindowDirection(wid, dir);
}

/** Minimize the focused window to the dock. */
export function minimizeFocusedWindow() {
  const wid = focusedWindowId();
  if (wid) restoreWindow(wid, /* minimize */ true);
}

/** Toggle the focused window's always-on-top flag. */
export function togglePinFocusedWindow() {
  const wid = focusedWindowId();
  if (wid) toggleWindowPin(wid);
}

/**
 * Close the focused tab (the active member). Browser-like: `mod+w` closes the
 * shown tab, not the whole window — the right-side titlebar X closes the window.
 */
export function closeFocusedWindow() {
  const tabId = getFocusedSurfaceId();
  if (tabId && bridge) bridge.closeTab(tabId);
}

/**
 * Cycle focus to the next (`+1`) / previous (`-1`) floating WINDOW, wrapping
 * around. Window order is derived from the apps tab order (`bridge.tabIds` mapped
 * through {@link windowForTab}, deduped, order-preserving) so cycling matches the
 * tab-strip order. The target window is un-minimized, raised, and its active
 * member focused — mirroring a dock click — so cycling reaches minimized windows
 * too.
 */
export function cycleWindows(step: 1 | -1) {
  if (!bridge || bridge.tabIds.length === 0) return;
  const { tabIds, focusTab } = bridge;
  // Ordered unique windowIds (apps tab order, deduped).
  const order: string[] = [];
  for (const tabId of tabIds) {
    const wid = windowForTab(tabId);
    if (wid && !order.includes(wid)) order.push(wid);
  }
  if (order.length === 0) return;
  const current = getFocusedSurfaceId();
  const currentWid = current ? windowForTab(current) : undefined;
  const from = currentWid ? Math.max(0, order.indexOf(currentWid)) : 0;
  const n = order.length;
  const nextWid = order[(((from + step) % n) + n) % n]!;
  if (nextWid === currentWid) return;
  const target = getFloatingWindow(nextWid);
  if (!target) return;
  restoreWindow(nextWid);
  bringWindowToFront(nextWid);
  focusTab(target.activeTabId);
}
