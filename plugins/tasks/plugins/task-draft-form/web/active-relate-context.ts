import { useSyncExternalStore } from "react";
import {
  getFocusedSurfaceId,
  subscribeFocusedSurface,
} from "@plugins/primitives/plugins/shortcuts/web";

export interface ActiveRelateContext {
  taskId: string;
}

type Listener = () => void;

// The ambient relate context is per-surface: it tracks which task the FOCUSED
// surface's conversation is about, so the single global Improve button (in the
// floating bar / toolbar — outside any surface tree) can default a new task to
// "relate to that conversation". A module singleton would tear across mounted
// surfaces (desktop multi-window / keep-alive tabs), so the value is keyed by
// surfaceId and the global reader resolves the FOCUSED surface's entry.
//
// Within a single surface several conversation panes can be mounted at once
// (e.g. the Miller chain `conv1 │ task │ conv2`); each carries an `owner` token
// so a closing background pane can only clear the entry IT set, never wipe the
// foreground pane's context.
interface Entry {
  owner: symbol;
  ctx: ActiveRelateContext;
}

const bySurface = new Map<string, Entry>();
const listeners = new Set<Listener>();

function notify() {
  listeners.forEach((fn) => fn());
}

/**
 * Set (or clear, with `null`) this surface's ambient relate context. Keyed by
 * surfaceId; the `owner` token scopes clears to the pane that set the entry.
 */
export function setActiveRelateContext(
  surfaceId: string,
  owner: symbol,
  ctx: ActiveRelateContext | null,
): void {
  if (ctx === null) {
    const cur = bySurface.get(surfaceId);
    if (cur && cur.owner !== owner) return; // a background pane closing — keep foreground
    bySurface.delete(surfaceId);
  } else {
    bySurface.set(surfaceId, { owner, ctx });
  }
  notify();
}

/**
 * Read the FOCUSED surface's ambient relate context. Re-renders on either a
 * registry change or a focus change between surfaces.
 */
export function useActiveRelateContext(): ActiveRelateContext | null {
  return useSyncExternalStore(subscribe, getSnapshot);
}

function subscribe(cb: Listener) {
  listeners.add(cb);
  const unsubFocus = subscribeFocusedSurface(cb);
  return () => {
    listeners.delete(cb);
    unsubFocus();
  };
}

function getSnapshot(): ActiveRelateContext | null {
  const focused = getFocusedSurfaceId();
  return focused ? bySurface.get(focused)?.ctx ?? null : null;
}
