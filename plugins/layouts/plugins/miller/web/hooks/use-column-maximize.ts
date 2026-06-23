import { useSyncExternalStore } from "react";
import { type PaneStore, usePaneStore } from "@plugins/primitives/plugins/pane/web";

// Maximize state is scoped per surface (per `PaneStore`): each Miller surface
// maximizes independently, so maximizing a column in one mounted surface (e.g.
// one app tab) never force-collapses columns in another. Within a single
// surface the semantics are unchanged: at most one maximized column, and any
// other column force-collapses while one is maximized.
interface SurfaceMaximize {
  maximizedId: string | null;
  subscribers: Set<() => void>;
}

const byStore = new WeakMap<PaneStore, SurfaceMaximize>();

function stateFor(store: PaneStore): SurfaceMaximize {
  let s = byStore.get(store);
  if (!s) {
    s = { maximizedId: null, subscribers: new Set() };
    byStore.set(store, s);
  }
  return s;
}

function notify(s: SurfaceMaximize) {
  for (const fn of s.subscribers) fn();
}

/** Surface-scoped: id of the maximized column in this surface, or null. */
export function useMaximizedId(): string | null {
  const store = usePaneStore();
  const s = stateFor(store);
  return useSyncExternalStore(
    (cb) => {
      s.subscribers.add(cb);
      return () => s.subscribers.delete(cb);
    },
    () => s.maximizedId,
    () => null,
  );
}

/** Surface-scoped clear of the current maximize. */
export function useClearMaximize(): () => void {
  const store = usePaneStore();
  return () => {
    const s = stateFor(store);
    s.maximizedId = null;
    notify(s);
  };
}

export function useColumnMaximize(paneId: string): [isMaximized: boolean, toggle: () => void] {
  const store = usePaneStore();
  const s = stateFor(store);
  const isMaximized = useSyncExternalStore(
    (cb) => {
      s.subscribers.add(cb);
      return () => s.subscribers.delete(cb);
    },
    () => s.maximizedId === paneId,
    () => false,
  );
  const toggle = () => {
    const next = stateFor(store);
    next.maximizedId = isMaximized ? null : paneId;
    notify(next);
  };

  return [isMaximized, toggle];
}
