import { useMemo } from "react";
import { defineScopedStore } from "@plugins/primitives/plugins/scoped-store/web";

/**
 * Per-song global transpose offset (in semitones) as a PER-SURFACE scoped store
 * rather than a module singleton.
 *
 * The offset drives the score pipeline (`transposeScore`) in `SonataProvider`,
 * but its persisted source of truth lives in the `transpose` feature plugin —
 * which the load-bearing shell cannot import (cycle). So the shell owns this tiny
 * store, reads it in the `baseScore` memo, and lets the feature plugin's headless
 * observer WRITE it (sync persisted → store) and the toolbar control set it
 * optimistically. Same direction as the cursor / key-mode stores: feature plugins
 * depend on the shell, never the reverse.
 *
 * Scoped to the `<TransposeStoreProvider>` (mounted in `SonataLayout`, wrapping
 * `SonataProvider`) so each Sonata surface holds its own offset — multi-window /
 * keep-alive tabs mount several surfaces at once and a singleton would bleed one
 * window's transpose into another.
 *
 * The observer is the sole owner of the song-scoped value: it writes the open
 * song's semitones and `0` when no song is open, so the previous song's offset
 * never leaks into the next.
 */

interface TransposeState {
  semitones: number;
}
const transposeStore = defineScopedStore<TransposeState>({ semitones: 0 });

export const TransposeStoreProvider = transposeStore.Provider;

/** Reactive read — re-renders the caller (e.g. the provider) on offset changes. */
export function useTransposeSemitones(): number {
  return transposeStore.useSelector((s) => s.semitones, []);
}

/**
 * Imperative setter for the per-surface offset. The `transpose` observer calls it
 * to sync the persisted per-song setting; the toolbar control calls it for
 * instant optimistic feedback. `setState` early-returns on an unchanged value
 * (Object.is bail), so no spurious listener fan-out.
 */
export function useSetTransposeSemitones(): (semitones: number) => void {
  const store = transposeStore.useStoreApi();
  return useMemo(
    () => (semitones: number) => store.setState({ semitones }),
    [store],
  );
}
