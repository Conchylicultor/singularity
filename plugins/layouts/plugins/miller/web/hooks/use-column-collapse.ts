import { useSyncExternalStore } from "react";

const KEY = (id: string) => `miller.collapse.${id}`;

const collapseState = new Map<string, boolean>();
const subscribers = new Set<() => void>();

function notify() {
  for (const fn of subscribers) fn();
}

function read(paneId: string): boolean {
  if (collapseState.has(paneId)) return collapseState.get(paneId)!;
  if (typeof window === "undefined") {
    collapseState.set(paneId, false);
    return false;
  }
  let v = false;
  try {
    v = sessionStorage.getItem(KEY(paneId)) === "true";
  } catch (err) {
    if (!(err instanceof DOMException)) throw err;
    v = false;
  }
  collapseState.set(paneId, v);
  return v;
}

export function useColumnCollapse(paneId: string): [boolean, () => void] {
  const collapsed = useSyncExternalStore(
    (cb) => {
      subscribers.add(cb);
      return () => subscribers.delete(cb);
    },
    () => read(paneId),
    () => false,
  );

  const toggle = () => {
    const next = !collapseState.get(paneId);
    collapseState.set(paneId, next);
    try {
      sessionStorage.setItem(KEY(paneId), String(next));
    // eslint-disable-next-line promise-safety/no-bare-catch
    } catch {
      // ignore storage errors (private mode, quota)
    }
    notify();
  };

  return [collapsed, toggle];
}
