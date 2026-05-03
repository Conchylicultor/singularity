import { useEffect, useState } from "react";

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
  const [, force] = useState(0);
  useEffect(() => {
    const fn = () => force((n) => n + 1);
    subscribers.add(fn);
    return () => {
      subscribers.delete(fn);
    };
  }, []);

  const isMaximized = maximizedId === paneId;
  const toggle = () => {
    maximizedId = isMaximized ? null : paneId;
    notify();
  };

  return [isMaximized, toggle];
}
