import { useSyncExternalStore } from "react";

export interface ActiveRelateContext {
  taskId: string;
}

type Listener = () => void;

let _current: ActiveRelateContext | null = null;
let _owner: symbol | null = null;
const _listeners = new Set<Listener>();

function notify() {
  _listeners.forEach((fn) => fn());
}

/**
 * Set the ambient relate context. Only the current owner can clear it,
 * preventing a closing side-pane from wiping the foreground pane's context.
 */
export function setActiveRelateContext(
  owner: symbol,
  ctx: ActiveRelateContext | null,
): void {
  if (ctx === null && _owner !== owner) return;
  _current = ctx;
  _owner = ctx ? owner : null;
  notify();
}

export function useActiveRelateContext(): ActiveRelateContext | null {
  return useSyncExternalStore(subscribe, getSnapshot);
}

function subscribe(cb: Listener) {
  _listeners.add(cb);
  return () => _listeners.delete(cb);
}

function getSnapshot() {
  return _current;
}
