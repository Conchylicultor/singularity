import { useEffect } from "react";
import { WindowDock } from "./window-dock";
import { SnapPreviewOverlay } from "./snap-preview-overlay";
import { TabDragOverlay } from "./tab-drag-overlay";
import { FloatingTabsBridge } from "./floating-tabs-bridge";
import { pruneWindows } from "../hooks/use-floating-windows";

/**
 * The floating placement's `Foreground`: the always-on overlay layer above every
 * window container. Composes the desktop dock (taskbar), the transient snap-zone
 * preview, and the headless tabs-bridge publisher (which feeds keyboard
 * window-management shortcuts) — all scoped to "there is >= 1 retained floating
 * window", so the placement hosts them through this one Foreground.
 *
 * Receives two id sets from the surface host's exit-presence layer: `tabIds`
 * (LIVE floating tabs) and `retainedTabIds` (live + those still animating out).
 * Only the LIVE ids reach the dock + tabs-bridge — a closing window's chip
 * disappears immediately and it can't be cycled / docked while it animates. The
 * store reconcile (`pruneWindows`) lives here (not in a per-window chrome) and
 * keys on BOTH sets, so a window mid-exit-tween is retained until its retention
 * ends rather than pruned out from under its chrome.
 *
 * The reconcile is a single keyed effect that runs WHILE MOUNTED — on mount and
 * whenever the retained set changes — never on unmount. This Foreground unmounts
 * on every surface-mode switch (it renders only in `floating` mode), which is NOT
 * the same as "no floating windows exist", so no teardown may touch the geometry
 * store; a mode round-trip must leave every window's box intact to be restored on
 * re-entry. The while-mounted reconcile still covers both prune cases: a genuine
 * last-tab-close empties `retainedTabIds` (→ the now-empty window is pruned), and
 * stale entries left by tabs closed while away from `floating` mode are pruned on
 * re-entry when the effect re-runs against the current live set.
 */
export function FloatingForeground({
  tabIds,
  retainedTabIds,
}: {
  tabIds: string[];
  retainedTabIds: string[];
}) {
  // Reconcile windows against the live + retained sets. Keyed on a stable join of
  // the RETAINED ids (a superset of live), so it re-runs both when a tab starts
  // exiting (live shrinks, prune reveals a sibling / keeps the window) and when
  // its retention ends (retained shrinks, prune deletes the empty window).
  const retainedKey = retainedTabIds.join(",");
  useEffect(() => {
    pruneWindows(new Set(tabIds), new Set(retainedTabIds));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the id set, not the array identity (mirrors the tabs-bridge effect)
  }, [retainedKey]);

  return (
    <>
      <FloatingTabsBridge tabIds={tabIds} />
      <SnapPreviewOverlay />
      <WindowDock tabIds={tabIds} />
      <TabDragOverlay />
    </>
  );
}
