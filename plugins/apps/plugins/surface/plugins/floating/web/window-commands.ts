import { getFocusedSurfaceId } from "@plugins/primitives/plugins/shortcuts/web";
import {
  bringWindowToFront,
  restoreWindow,
  snapWindowDirection,
} from "./hooks/use-window-geometry";
import type { SnapDirection } from "./hooks/use-snap";

/**
 * Imperative window-management commands driven by the static keyboard shortcuts
 * (registered in this plugin's barrel). The focused window is the focused
 * *surface* — `getFocusedSurfaceId()` returns the focused tabId (the apps tab
 * model feeds it into the shortcut system on every focus change), so snap /
 * minimize need no tab handle and read it directly.
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

/** Tile the focused window in a direction (maximize/quarter/restore/minimize). */
export function snapFocusedWindow(dir: SnapDirection) {
  const tabId = getFocusedSurfaceId();
  if (tabId) snapWindowDirection(tabId, dir);
}

/** Minimize the focused window to the dock. */
export function minimizeFocusedWindow() {
  const tabId = getFocusedSurfaceId();
  if (tabId) restoreWindow(tabId, /* minimize */ true);
}

/** Close the focused window. */
export function closeFocusedWindow() {
  const tabId = getFocusedSurfaceId();
  if (tabId && bridge) bridge.closeTab(tabId);
}

/**
 * Cycle focus to the next (`+1`) / previous (`-1`) floating window, wrapping
 * around. The target is un-minimized, raised, and focused — mirroring a dock
 * click — so cycling reaches minimized windows too.
 */
export function cycleWindows(step: 1 | -1) {
  if (!bridge || bridge.tabIds.length === 0) return;
  const { tabIds, focusTab } = bridge;
  const current = getFocusedSurfaceId();
  const from = current ? Math.max(0, tabIds.indexOf(current)) : 0;
  const n = tabIds.length;
  const next = tabIds[(((from + step) % n) + n) % n];
  if (!next || next === current) return;
  restoreWindow(next);
  bringWindowToFront(next);
  focusTab(next);
}
