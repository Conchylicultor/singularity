import { useSyncExternalStore } from "react";

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
  } catch (err) {
    if (!(err instanceof DOMException)) throw err;
    return false;
  }
}

function readStored(paneId: string): number | undefined {
  try {
    const v = localStorage.getItem(LS_KEY(paneId));
    return v != null ? Number(v) : undefined;
  } catch (err) {
    if (!(err instanceof DOMException)) throw err;
    return undefined;
  }
}

function persistWidth(paneId: string, width: number) {
  try {
    localStorage.setItem(LS_KEY(paneId), String(width));
  // eslint-disable-next-line promise-safety/no-bare-catch
  } catch {}
}

type WidthUpdater = number | ((prev: number) => number);

function getWidth(paneId: string, defaultWidth: number): number {
  if (!widthState.has(paneId)) {
    widthState.set(paneId, readStored(paneId) ?? defaultWidth);
  }
  return widthState.get(paneId)!;
}

export function useColumnWidth(
  paneId: string,
  defaultWidth: number,
): [number, (next: WidthUpdater) => void] {
  const width = useSyncExternalStore(
    (cb) => {
      subscribers.add(cb);
      return () => subscribers.delete(cb);
    },
    () => getWidth(paneId, defaultWidth),
    () => defaultWidth,
  );

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
