import { useEffect, useRef, useState } from "react";
import { type Tab } from "@plugins/apps/web";
import { type PlacementDef } from "../slots";

/**
 * One entry in the presence render list: a tab to render plus whether it is on
 * its way out (left the store, retained for its placement's exit tween).
 */
export interface TabPresence {
  tab: Tab;
  /** True while this tab has left the store but is still retained for an exit tween. */
  exiting: boolean;
}

/** A retained (exiting) tab: its last-known object + index, plus the teardown timer. */
interface Retained {
  tab: Tab;
  /** Last-known index in the store's tab order, so it re-renders in place. */
  index: number;
  timer: ReturnType<typeof setTimeout>;
}

/**
 * Exit-presence layer for the surface body (view layer only — the tabs store is
 * never touched). Diffs the live `tabs` each render: when a tab vanishes and its
 * resolved placement declares an {@link PlacementDef.exitDurationMs}, its last
 * render's `Tab` object is RETAINED for that many ms so the placement's Chrome
 * can play an exit tween, then it is truly dropped (forcing a re-render via a
 * version counter). Placements without `exitDurationMs` unmount instantly.
 *
 * The returned list is the live tabs (in store order, `exiting:false`) with each
 * retained exiting tab spliced back at its last-known index (`exiting:true`).
 *
 * The `setTimeout`/`clearTimeout` here are NOT a polling loop — they are
 * push-driven by store diffs (one one-shot teardown timer per exiting tab),
 * exactly the deferred-unmount idiom this view layer needs.
 */
export function useTabPresence(
  tabs: Tab[],
  byId: Map<string, PlacementDef>,
  defaultId: string,
): TabPresence[] {
  // Previous render's tabs (to recover a vanished id's full Tab object) and its
  // live id set (to diff which ids left the store this render).
  const prevTabsRef = useRef<Tab[]>(tabs);
  const prevLiveIdsRef = useRef<Set<string>>(new Set(tabs.map((t) => t.tabId)));
  // Retained exiting tabs, keyed by tabId. Bumping `version` forces a re-render
  // after a timer fires (the map mutation alone wouldn't).
  const retainedRef = useRef<Map<string, Retained>>(new Map());
  const [, setVersion] = useState(0);
  const bump = () => setVersion((v) => v + 1);

  const liveIds = new Set(tabs.map((t) => t.tabId));
  const prevTabs = prevTabsRef.current;
  const prevLiveIds = prevLiveIdsRef.current;
  const retained = retainedRef.current;

  // Reopen guard: any retained id that has reappeared in the live store is no
  // longer exiting — clear its timer and drop it so it renders live again.
  // eslint-disable-next-line react-hooks/refs -- intentional render-time exit-presence diff: the vanishing tab must persist in this same render to play its exit tween; refs track prev-render state and the retained map by design
  for (const id of [...retained.keys()]) {
    if (liveIds.has(id)) {
      // eslint-disable-next-line react-hooks/refs -- intentional render-time exit-presence diff: the vanishing tab must persist in this same render to play its exit tween; refs track prev-render state and the retained map by design
      clearTimeout(retained.get(id)!.timer);
      // eslint-disable-next-line react-hooks/refs -- intentional render-time exit-presence diff: the vanishing tab must persist in this same render to play its exit tween; refs track prev-render state and the retained map by design
      retained.delete(id);
    }
  }

  // For every id present last render but absent now, retain it (if its placement
  // opts into an exit tween) so its Chrome can animate out before unmounting.
  // eslint-disable-next-line react-hooks/refs -- intentional render-time exit-presence diff: the vanishing tab must persist in this same render to play its exit tween; refs track prev-render state and the retained map by design
  for (let i = 0; i < prevTabs.length; i++) {
    const tab = prevTabs[i]!;
    // eslint-disable-next-line react-hooks/refs -- intentional render-time exit-presence diff: the vanishing tab must persist in this same render to play its exit tween; refs track prev-render state and the retained map by design
    if (liveIds.has(tab.tabId)) continue;
    // eslint-disable-next-line react-hooks/refs -- intentional render-time exit-presence diff: the vanishing tab must persist in this same render to play its exit tween; refs track prev-render state and the retained map by design
    if (!prevLiveIds.has(tab.tabId)) continue; // already gone before this render
    // eslint-disable-next-line react-hooks/refs -- intentional render-time exit-presence diff: the vanishing tab must persist in this same render to play its exit tween; refs track prev-render state and the retained map by design
    if (retained.has(tab.tabId)) continue; // already retained
    // eslint-disable-next-line react-hooks/refs -- intentional render-time exit-presence diff: the vanishing tab must persist in this same render to play its exit tween; refs track prev-render state and the retained map by design
    const def = byId.get(tab.placement) ?? byId.get(defaultId);
    const duration = def?.exitDurationMs;
    if (!duration || duration <= 0) continue; // instant unmount (docked / solo)
    // eslint-disable-next-line react-hooks/refs -- intentional render-time exit-presence diff: the vanishing tab must persist in this same render to play its exit tween; refs track prev-render state and the retained map by design
    const timer = setTimeout(() => {
      retainedRef.current.delete(tab.tabId);
      bump();
    }, duration);
    // eslint-disable-next-line react-hooks/refs -- intentional render-time exit-presence diff: the vanishing tab must persist in this same render to play its exit tween; refs track prev-render state and the retained map by design
    retained.set(tab.tabId, { tab, index: i, timer });
  }

  // eslint-disable-next-line react-hooks/refs -- intentional render-time exit-presence diff: the vanishing tab must persist in this same render to play its exit tween; refs track prev-render state and the retained map by design
  prevTabsRef.current = tabs;
  // eslint-disable-next-line react-hooks/refs -- intentional render-time exit-presence diff: the vanishing tab must persist in this same render to play its exit tween; refs track prev-render state and the retained map by design
  prevLiveIdsRef.current = liveIds;

  // Clear every pending teardown timer on unmount (no dangling timers).
  useEffect(() => {
    const map = retainedRef.current;
    return () => {
      for (const r of map.values()) clearTimeout(r.timer);
      map.clear();
    };
  }, []);

  // Render list: live tabs in store order, then splice each retained exiting tab
  // back at its last-known index so it animates out where it sat.
  const out: TabPresence[] = tabs.map((tab) => ({ tab, exiting: false }));
  // eslint-disable-next-line react-hooks/refs -- intentional render-time exit-presence diff: the vanishing tab must persist in this same render to play its exit tween; refs track prev-render state and the retained map by design
  const exiting = [...retained.values()].sort((a, b) => a.index - b.index);
  for (const r of exiting) {
    const at = Math.min(Math.max(0, r.index), out.length);
    out.splice(at, 0, { tab: r.tab, exiting: true });
  }
  return out;
}
