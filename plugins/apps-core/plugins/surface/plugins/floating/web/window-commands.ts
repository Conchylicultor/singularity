import { defineInstallSink } from "@plugins/primitives/plugins/scope/plugins/install-sink/web";
import { getFocusedSurfaceId } from "@plugins/primitives/plugins/shortcuts/web";
import {
  bringWindowToFront,
  createDesktop,
  getDesktopsState,
  getFloatingWindow,
  moveWindowToDesktop,
  restoreWindow,
  setActiveDesktop,
  snapWindowDirection,
  toggleWindowPin,
  topmostWindowOnDesktop,
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
 * only through the `useTabs()` hook, so a tiny in-tree publisher (the
 * {@link floatingTabsBridgeSink} install sink, filled from the floating
 * Foreground) bridges them to module scope. There is never more than one
 * floating surface in focus, so a single page-global slot is the right shape.
 * Every read below runs from a keyboard-shortcut handler — after installation,
 * and re-sampled on every keypress — so `peek()` is the correct read.
 */
export interface FloatingTabsBridge {
  /** Open floating tabIds, in tab-strip order (cycle order). */
  tabIds: string[];
  focusTab: (tabId: string) => void;
  closeTab: (tabId: string) => void;
}

/** The live tabs bridge, installed by `FloatingTabsBridge` while a floating window exists. */
export const floatingTabsBridgeSink = defineInstallSink<FloatingTabsBridge>({
  name: "floating.tabs-bridge",
  what: "the floating tab order + focus/close callbacks (installed by the floating Foreground's FloatingTabsBridge)",
});

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
  const bridge = floatingTabsBridgeSink.peek();
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
  const bridge = floatingTabsBridgeSink.peek();
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

/**
 * Switch to the next (`+1`) / previous (`-1`) virtual desktop in list order,
 * WRAPPING, then focus that desktop's topmost (highest-z, non-minimized) window
 * via the tabs bridge. An empty desktop simply gets no focus on switch.
 */
export function switchDesktopByDelta(step: 1 | -1) {
  const { desktops, activeDesktopId } = getDesktopsState();
  const n = desktops.length;
  if (n === 0) return;
  const from = Math.max(
    0,
    desktops.findIndex((d) => d.id === activeDesktopId),
  );
  const target = desktops[(((from + step) % n) + n) % n]!;
  if (target.id === activeDesktopId) return;
  setActiveDesktop(target.id);
  const top = topmostWindowOnDesktop(target.id);
  if (top) floatingTabsBridgeSink.peek()?.focusTab(top.activeTabId);
}

/**
 * Move the focused window to the next (`+1`) / previous (`-1`) virtual desktop
 * and follow it (the macOS shift-move convention). Moving past the LAST desktop
 * creates a new one; moving before the FIRST is clamped (no-op). After the move
 * the target desktop becomes active, the moved window is raised, and its active
 * member is re-focused.
 */
export function moveFocusedWindowByDelta(step: 1 | -1) {
  const tabId = getFocusedSurfaceId();
  const windowId = tabId ? windowForTab(tabId) : undefined;
  if (!windowId) return;
  const win = getFloatingWindow(windowId);
  if (!win) return;
  const { desktops } = getDesktopsState();
  const currentIndex = desktops.findIndex((d) => d.id === win.desktopId);
  if (currentIndex === -1) return;
  const targetIndex = currentIndex + step;
  let targetId: string;
  if (step === 1 && targetIndex === desktops.length) {
    // Past the last desktop → spill into a freshly-created one (don't activate
    // here; setActiveDesktop below follows the window).
    targetId = createDesktop();
  } else if (step === -1 && targetIndex < 0) {
    return; // Clamp: nothing before the first desktop.
  } else {
    targetId = desktops[targetIndex]!.id;
  }
  moveWindowToDesktop(windowId, targetId);
  setActiveDesktop(targetId);
  bringWindowToFront(windowId);
  floatingTabsBridgeSink.peek()?.focusTab(win.activeTabId);
}
