import { useSyncExternalStore } from "react";

/**
 * Per-song "auto-detect key" flag as a module-level store rather than React
 * context state.
 *
 * The flag controls the score pipeline (`inferKeys` force-override) in
 * `SonataProvider`, but its persisted source of truth lives in the `key-mode`
 * feature plugin — which the load-bearing shell cannot import (cycle). So the
 * shell owns this tiny store, reads it in the `baseScore` memo, and lets the
 * feature plugin's headless observer WRITE it (sync persisted → store) and the
 * key-readout toggle set it optimistically. Same direction as the cursor /
 * transport module stores: feature plugins depend on the shell, never the
 * reverse. One Sonata app mounts at a time, so a singleton is correct.
 *
 * The observer is the sole owner of the song-scoped value: it writes the open
 * song's setting and `false` when no song is open, so the previous song's
 * override never leaks into the next.
 */

let keyAutoDetect = false;
const listeners = new Set<() => void>();

/** Imperative / snapshot read of the flag. */
export function getKeyAutoDetect(): boolean {
  return keyAutoDetect;
}

/**
 * Set the flag. The `key-mode` observer calls this to sync the persisted
 * per-song setting; the key-readout toggle calls it for instant optimistic
 * feedback. Early-returns on an unchanged value so `useSyncExternalStore`'s
 * snapshot stays referentially stable (a boolean is already stable, but the
 * guard avoids spurious listener fan-out).
 */
export function setKeyAutoDetect(value: boolean): void {
  if (value === keyAutoDetect) return;
  keyAutoDetect = value;
  for (const listener of listeners) listener();
}

/** Subscribe to flag changes. Returns an unsubscribe. */
export function subscribeKeyAutoDetect(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}

/** Reactive read — re-renders the caller (e.g. the provider) on flag changes. */
export function useKeyAutoDetect(): boolean {
  return useSyncExternalStore(subscribeKeyAutoDetect, getKeyAutoDetect);
}
