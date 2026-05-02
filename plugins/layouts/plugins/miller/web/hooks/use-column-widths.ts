import { useEffect, useState } from "react";

const MIN_WIDTH = 200;

const widthState = new Map<string, number>();
const subscribers = new Set<() => void>();

function notify() {
  for (const fn of subscribers) fn();
}

type WidthUpdater = number | ((prev: number) => number);

export function useColumnWidth(
  paneId: string,
  defaultWidth: number,
): [number, (next: WidthUpdater) => void] {
  const [, force] = useState(0);
  useEffect(() => {
    const fn = () => force((n) => n + 1);
    subscribers.add(fn);
    return () => {
      subscribers.delete(fn);
    };
  }, []);

  const width = widthState.get(paneId) ?? defaultWidth;

  const setWidth = (next: WidthUpdater) => {
    const current = widthState.get(paneId) ?? defaultWidth;
    const value = typeof next === "function" ? next(current) : next;
    const clamped = Math.max(MIN_WIDTH, value);
    if (clamped === widthState.get(paneId)) return;
    widthState.set(paneId, clamped);
    notify();
  };

  return [width, setWidth];
}
