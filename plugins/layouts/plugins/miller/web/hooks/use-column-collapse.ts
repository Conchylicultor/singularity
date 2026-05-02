import { useEffect, useState } from "react";

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
  } catch {
    v = false;
  }
  collapseState.set(paneId, v);
  return v;
}

export function useColumnCollapse(paneId: string): [boolean, () => void] {
  const [, force] = useState(0);
  useEffect(() => {
    const fn = () => force((n) => n + 1);
    subscribers.add(fn);
    return () => {
      subscribers.delete(fn);
    };
  }, []);

  const collapsed = read(paneId);

  const toggle = () => {
    const next = !collapseState.get(paneId);
    collapseState.set(paneId, next);
    try {
      sessionStorage.setItem(KEY(paneId), String(next));
    } catch {
      // ignore storage errors (private mode, quota)
    }
    notify();
  };

  return [collapsed, toggle];
}
