import { useMemo } from "react";
import { defineScopedStore } from "@plugins/primitives/plugins/scope/plugins/scoped-store/web";

/**
 * Per-song "chord mode" flag as a PER-SURFACE scoped store rather than a module
 * singleton.
 *
 * When on, the score pipeline in `SonataProvider` runs a second re-voicing pass
 * AFTER chord analysis, voicing every chord annotation — the analyzer-derived
 * ones included — onto the synthesized Chords / Bass tracks. That is how a MIDI
 * song is played "as its chords" through the same voicing + groove a chord grid
 * uses. The flag's persisted source of truth lives in the `chord-mode` feature
 * plugin — which the load-bearing shell cannot import (cycle). So the shell owns
 * this tiny store, reads it in the `baseScore` memo, and lets the feature
 * plugin's headless observer WRITE it (sync persisted → store) and its toggle
 * set it optimistically. Same direction as the cursor / key-mode / transpose /
 * rhythm stores: feature plugins depend on the shell, never the reverse.
 *
 * Scoped to the `<ChordModeStoreProvider>` (mounted in `SonataLayout`, wrapping
 * `SonataProvider`) so each Sonata surface holds its own flag — multi-window /
 * keep-alive tabs mount several surfaces at once and a singleton would bleed one
 * window's mode into another.
 *
 * The observer is the sole owner of the song-scoped value: it writes the open
 * song's setting and `false` when no song is open, so the previous song's mode
 * never leaks into the next.
 */

interface ChordModeState {
  enabled: boolean;
}
const chordModeStore = defineScopedStore<ChordModeState>({ enabled: false });

export const ChordModeStoreProvider = chordModeStore.Provider;

/** Reactive read — re-renders the caller (e.g. the provider) on flag changes. */
export function useChordMode(): boolean {
  return chordModeStore.useSelector((s) => s.enabled, []);
}

/**
 * Imperative setter for the per-surface flag. The `chord-mode` observer calls it
 * to sync the persisted per-song setting; the toggle calls it for instant
 * optimistic feedback. `setState` early-returns on an unchanged value (Object.is
 * bail), so no spurious listener fan-out.
 */
export function useSetChordMode(): (enabled: boolean) => void {
  const store = chordModeStore.useStoreApi();
  return useMemo(
    () => (enabled: boolean) => store.setState({ enabled }),
    [store],
  );
}
