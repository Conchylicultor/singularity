import { useSyncExternalStore } from "react";
import { type PaneStore, usePaneStore } from "@plugins/primitives/plugins/pane/web";
import { useSurfaceTabId } from "@plugins/primitives/plugins/surface-id/web";

// Collapse state is scoped per surface (per `PaneStore`): each Miller surface
// collapses columns independently, so collapsing a column in one mounted surface
// (e.g. one desktop window / keep-alive tab) never collapses it in another.
// Persistence is keyed by `(tabId, paneId)` so it survives navigation within a
// tab session without bleeding across surfaces.
interface SurfaceCollapse {
  state: Map<string, boolean>;
  subscribers: Set<() => void>;
}

const byStore = new WeakMap<PaneStore, SurfaceCollapse>();

function stateFor(store: PaneStore): SurfaceCollapse {
  let s = byStore.get(store);
  if (!s) {
    s = { state: new Map(), subscribers: new Set() };
    byStore.set(store, s);
  }
  return s;
}

const KEY = (tabId: string, paneId: string) => `miller.collapse.${tabId}.${paneId}`;

function read(s: SurfaceCollapse, tabId: string | undefined, paneId: string): boolean {
  if (s.state.has(paneId)) return s.state.get(paneId)!;
  let v = false;
  if (tabId !== undefined && typeof window !== "undefined") {
    try {
      v = sessionStorage.getItem(KEY(tabId, paneId)) === "true";
    } catch (err) {
      if (!(err instanceof DOMException)) throw err;
      v = false;
    }
  }
  s.state.set(paneId, v);
  return v;
}

export function useColumnCollapse(paneId: string): [boolean, () => void] {
  const store = usePaneStore();
  const tabId = useSurfaceTabId();
  const s = stateFor(store);

  const collapsed = useSyncExternalStore(
    (cb) => {
      s.subscribers.add(cb);
      return () => s.subscribers.delete(cb);
    },
    () => read(s, tabId, paneId),
    () => false,
  );

  const toggle = () => {
    const next = !s.state.get(paneId);
    s.state.set(paneId, next);
    if (tabId !== undefined) {
      try {
        sessionStorage.setItem(KEY(tabId, paneId), String(next));
      // eslint-disable-next-line promise-safety/no-bare-catch
      } catch {
        // ignore storage errors (private mode, quota)
      }
    }
    for (const fn of s.subscribers) fn();
  };

  return [collapsed, toggle];
}
