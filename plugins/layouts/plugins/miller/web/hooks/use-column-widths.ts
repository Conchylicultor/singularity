import { useSyncExternalStore } from "react";
import { type PaneStore, usePaneStore } from "@plugins/primitives/plugins/pane/web";
import { useSurfaceTabId } from "@plugins/primitives/plugins/surface-id/web";

const MIN_WIDTH = 200;

// Column widths are scoped per surface (per `PaneStore`): each Miller surface
// resizes columns independently, so dragging a divider in one mounted surface
// (e.g. one desktop window / keep-alive tab) never resizes it in another.
// Persistence is keyed by `(tabId, paneId)` so a tab keeps its widths across
// navigation/reload without bleeding across surfaces.
interface SurfaceWidths {
  state: Map<string, number>;
  subscribers: Set<() => void>;
}

const byStore = new WeakMap<PaneStore, SurfaceWidths>();

function stateFor(store: PaneStore): SurfaceWidths {
  let s = byStore.get(store);
  if (!s) {
    s = { state: new Map(), subscribers: new Set() };
    byStore.set(store, s);
  }
  return s;
}

const LS_KEY = (tabId: string, paneId: string) => `miller.width.${tabId}.${paneId}`;

export function hasStoredWidth(tabId: string | undefined, paneId: string): boolean {
  if (tabId === undefined) return false;
  try {
    return localStorage.getItem(LS_KEY(tabId, paneId)) !== null;
  } catch (err) {
    if (!(err instanceof DOMException)) throw err;
    return false;
  }
}

function readStored(tabId: string | undefined, paneId: string): number | undefined {
  if (tabId === undefined) return undefined;
  try {
    const v = localStorage.getItem(LS_KEY(tabId, paneId));
    return v != null ? Number(v) : undefined;
  } catch (err) {
    if (!(err instanceof DOMException)) throw err;
    return undefined;
  }
}

function persistWidth(tabId: string | undefined, paneId: string, width: number) {
  if (tabId === undefined) return;
  try {
    localStorage.setItem(LS_KEY(tabId, paneId), String(width));
  // eslint-disable-next-line promise-safety/no-bare-catch
  } catch {}
}

type WidthUpdater = number | ((prev: number) => number);

function getWidth(
  s: SurfaceWidths,
  tabId: string | undefined,
  paneId: string,
  defaultWidth: number,
): number {
  if (!s.state.has(paneId)) {
    s.state.set(paneId, readStored(tabId, paneId) ?? defaultWidth);
  }
  return s.state.get(paneId)!;
}

export function useColumnWidth(
  paneId: string,
  defaultWidth: number,
): [number, (next: WidthUpdater) => void] {
  const store = usePaneStore();
  const tabId = useSurfaceTabId();
  const s = stateFor(store);

  const width = useSyncExternalStore(
    (cb) => {
      s.subscribers.add(cb);
      return () => s.subscribers.delete(cb);
    },
    () => getWidth(s, tabId, paneId, defaultWidth),
    () => defaultWidth,
  );

  const setWidth = (next: WidthUpdater) => {
    const current = s.state.get(paneId)!;
    const value = typeof next === "function" ? next(current) : next;
    const clamped = Math.max(MIN_WIDTH, value);
    if (clamped === s.state.get(paneId)) return;
    s.state.set(paneId, clamped);
    persistWidth(tabId, paneId, clamped);
    for (const fn of s.subscribers) fn();
  };

  return [width, setWidth];
}
