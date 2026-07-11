import { useMemo } from "react";
import { defineScopedStore } from "@plugins/primitives/plugins/scoped-store/web";
import type { RhythmHands } from "@plugins/apps/plugins/sonata/plugins/rhythm/core";

/**
 * Per-song groove — the two-hand onset necklace (`hands`) plus each hand's
 * tone-order figuration id (`bassFigurationId`/`chordFigurationId`) — as a
 * PER-SURFACE scoped store rather than a module singleton. The rhythm-grid (the
 * *when*) and the figuration (the *what*) are the two halves of one accompaniment
 * pattern, so they travel together into `reVoiceChords`.
 */
export interface RhythmGroove {
  hands: RhythmHands;
  bassFigurationId: string;
  chordFigurationId: string;
}

/**
 * The groove drives the score pipeline (`reVoiceChords`) in `SonataProvider`, but
 * its persisted source of truth lives in the `rhythm-controls` feature plugin —
 * which the load-bearing shell cannot import (cycle). So the shell owns this tiny
 * store, reads it in the `baseScore` memo, and lets the feature plugin's headless
 * observer WRITE it (sync persisted → store) and its controls set it
 * optimistically. Same direction as the cursor / key-mode / transpose stores:
 * feature plugins depend on the shell, never the reverse.
 *
 * Scoped to the `<RhythmStoreProvider>` (mounted in `SonataLayout`, wrapping
 * `SonataProvider`) so each Sonata surface holds its own groove — multi-window /
 * keep-alive tabs mount several surfaces at once and a singleton would bleed one
 * window's groove into another.
 *
 * `null` ⇒ no groove ⇒ today's block-chord behaviour. The observer is the sole
 * owner of the song-scoped value: it writes the open song's groove and `null` when
 * no song is open, so the previous song's groove never leaks into the next.
 */

interface RhythmState {
  groove: RhythmGroove | null;
}
const rhythmStore = defineScopedStore<RhythmState>({ groove: null });

export const RhythmStoreProvider = rhythmStore.Provider;

/** Reactive read — re-renders the caller (e.g. the provider) on groove changes. */
export function useRhythmGroove(): RhythmGroove | null {
  return rhythmStore.useSelector((s) => s.groove, []);
}

/**
 * Imperative setter for the per-surface groove. The `rhythm-controls` observer
 * calls it to sync the persisted per-song setting; the controls call it for
 * instant optimistic feedback. `setState` early-returns on an unchanged value
 * (Object.is bail), so no spurious listener fan-out.
 */
export function useSetRhythmGroove(): (groove: RhythmGroove | null) => void {
  const store = rhythmStore.useStoreApi();
  return useMemo(
    () => (groove: RhythmGroove | null) => store.setState({ groove }),
    [store],
  );
}
