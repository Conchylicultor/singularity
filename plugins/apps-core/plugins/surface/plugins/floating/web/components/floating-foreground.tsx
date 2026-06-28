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

  // Final cleanup when the LAST floating tab leaves: this Foreground unmounts once
  // no floating tab remains (live or exiting), so the keyed prune effect above can
  // never run its case-3 delete for that last window — it would linger empty in the
  // store + sessionStorage. Reconcile against empty live+retained sets on unmount,
  // which deletes every now-empty window (case 3) and persists. Kept SEPARATE from
  // the keyed effect (empty deps) so it fires ONLY on unmount, never on a dep
  // change — running it on a dep change would momentarily delete a window about to
  // be kept. A minimized window keeps its member tabs open, so this Foreground
  // stays mounted and the cleanup never fires for it.
  useEffect(() => {
    return () => pruneWindows(new Set(), new Set());
  }, []);

  return (
    <>
      <FloatingTabsBridge tabIds={tabIds} />
      <SnapPreviewOverlay />
      <WindowDock tabIds={tabIds} />
      <TabDragOverlay />
    </>
  );
}
