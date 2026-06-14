import { useSyncExternalStore } from "react";

// Exactly one surface is focused per page — a legitimately page-global signal,
// readable from the window keydown handler (outside any React subtree) AND
// reactively from global chrome (a single toolbar/floating-bar button that must
// reflect whichever surface is currently focused).
// eslint-disable-next-line scoped-store/no-module-mutable-store -- page-global by design: exactly one surface is focused per page; the value is read from the window keydown handler outside any React subtree, so it cannot be a per-surface scoped store.
let focusedSurfaceId: string | undefined;
const listeners = new Set<() => void>();

export function setFocusedSurfaceId(id: string | undefined): void {
  if (id === focusedSurfaceId) return;
  focusedSurfaceId = id;
  for (const l of listeners) l();
}

export function getFocusedSurfaceId(): string | undefined {
  return focusedSurfaceId;
}

/**
 * Reactive read of the focused surface id, for global chrome that must re-render
 * when focus moves between mounted surfaces (desktop multi-window / keep-alive
 * tabs). Outside React, read `getFocusedSurfaceId()` directly instead.
 */
export function useFocusedSurfaceId(): string | undefined {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    getFocusedSurfaceId,
    () => undefined,
  );
}

/** Subscribe to focus changes from outside React (returns an unsubscribe). */
export function subscribeFocusedSurface(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
