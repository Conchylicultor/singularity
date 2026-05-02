import { useEffect, useState } from "react";

const MIN_WIDTH = 200;

const widthState = new Map<string, number>();
const subscribers = new Set<() => void>();

function notify() {
  for (const fn of subscribers) fn();
}

const LS_KEY = (id: string) => `miller.width.${id}`;

export function hasStoredWidth(paneId: string): boolean {
  try {
    return localStorage.getItem(LS_KEY(paneId)) !== null;
  } catch {
    return false;
  }
}

function readStored(paneId: string): number | undefined {
  try {
    const v = localStorage.getItem(LS_KEY(paneId));
    return v != null ? Number(v) : undefined;
  } catch {
    return undefined;
  }
}

function persistWidth(paneId: string, width: number) {
  try {
    localStorage.setItem(LS_KEY(paneId), String(width));
  } catch {}
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

  if (!widthState.has(paneId)) {
    widthState.set(paneId, readStored(paneId) ?? defaultWidth);
  }
  const width = widthState.get(paneId)!;

  const setWidth = (next: WidthUpdater) => {
    const current = widthState.get(paneId)!;
    const value = typeof next === "function" ? next(current) : next;
    const clamped = Math.max(MIN_WIDTH, value);
    if (clamped === widthState.get(paneId)) return;
    widthState.set(paneId, clamped);
    persistWidth(paneId, clamped);
    notify();
  };

  return [width, setWidth];
}
