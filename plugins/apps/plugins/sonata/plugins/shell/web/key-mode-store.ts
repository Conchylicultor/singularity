import { useMemo } from "react";
import { defineScopedStore } from "@plugins/primitives/plugins/scoped-store/web";

/**
 * Per-song "auto-detect key" flag as a PER-SURFACE scoped store rather than a
 * module singleton.
 *
 * The flag controls the score pipeline (`inferKeys` force-override) in
 * `SonataProvider`, but its persisted source of truth lives in the `key-mode`
 * feature plugin — which the load-bearing shell cannot import (cycle). So the
 * shell owns this tiny store, reads it in the `baseScore` memo, and lets the
 * feature plugin's headless observer WRITE it (sync persisted → store) and the
 * key-readout toggle set it optimistically. Same direction as the cursor store:
 * feature plugins depend on the shell, never the reverse.
 *
 * Scoped to the `<KeyModeStoreProvider>` (mounted in `SonataLayout`, wrapping
 * `SonataProvider`) so each Sonata surface holds its own flag — multi-window /
 * keep-alive tabs mount several surfaces at once and a singleton would bleed one
 * window's key mode into another.
 *
 * The observer is the sole owner of the song-scoped value: it writes the open
 * song's setting and `false` when no song is open, so the previous song's
 * override never leaks into the next.
 */

interface KeyModeState {
  autoDetect: boolean;
}
const keyModeStore = defineScopedStore<KeyModeState>({ autoDetect: false });

export const KeyModeStoreProvider = keyModeStore.Provider;

/** Reactive read — re-renders the caller (e.g. the provider) on flag changes. */
export function useKeyAutoDetect(): boolean {
  return keyModeStore.useSelector((s) => s.autoDetect, []);
}

/**
 * Imperative setter for the per-surface flag. The `key-mode` observer calls it
 * to sync the persisted per-song setting; the key-readout toggle calls it for
 * instant optimistic feedback. `setState` early-returns on an unchanged value
 * (Object.is bail), so no spurious listener fan-out.
 */
export function useSetKeyAutoDetect(): (autoDetect: boolean) => void {
  const store = keyModeStore.useStoreApi();
  return useMemo(
    () => (autoDetect: boolean) => store.setState({ autoDetect }),
    [store],
  );
}
