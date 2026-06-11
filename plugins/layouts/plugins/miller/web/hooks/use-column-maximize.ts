import { useSyncExternalStore } from "react";

let maximizedId: string | null = null;
const subscribers = new Set<() => void>();

function notify() {
  for (const fn of subscribers) fn();
}

export function getMaximizedId(): string | null {
  return maximizedId;
}

export function clearMaximize() {
  maximizedId = null;
  notify();
}

export function useColumnMaximize(paneId: string): [isMaximized: boolean, toggle: () => void] {
  const isMaximized = useSyncExternalStore(
    (cb) => {
      subscribers.add(cb);
      return () => subscribers.delete(cb);
    },
    () => maximizedId === paneId,
    () => false,
  );
  const toggle = () => {
    maximizedId = isMaximized ? null : paneId;
    notify();
  };

  return [isMaximized, toggle];
}
