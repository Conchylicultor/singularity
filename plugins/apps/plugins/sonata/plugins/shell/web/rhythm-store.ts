import { useMemo } from "react";
import { defineScopedStore } from "@plugins/primitives/plugins/scoped-store/web";
import type { RhythmHands } from "@plugins/apps/plugins/sonata/plugins/rhythm/core";

/**
 * Per-song left/right-hand rhythm (the two-hand onset necklace) as a PER-SURFACE
 * scoped store rather than a module singleton.
 *
 * The hands drive the score pipeline (`reVoiceChords`) in `SonataProvider`, but
 * their persisted source of truth lives in the `rhythm-controls` feature plugin —
 * which the load-bearing shell cannot import (cycle). So the shell owns this tiny
 * store, reads it in the `baseScore` memo, and lets the feature plugin's headless
 * observer WRITE it (sync persisted → store) and its controls set it
 * optimistically. Same direction as the cursor / key-mode / transpose stores:
 * feature plugins depend on the shell, never the reverse.
 *
 * Scoped to the `<RhythmStoreProvider>` (mounted in `SonataLayout`, wrapping
 * `SonataProvider`) so each Sonata surface holds its own hands — multi-window /
 * keep-alive tabs mount several surfaces at once and a singleton would bleed one
 * window's groove into another.
 *
 * `null` ⇒ no rhythm ⇒ today's block-chord behaviour. The observer is the sole
 * owner of the song-scoped value: it writes the open song's hands and `null` when
 * no song is open, so the previous song's groove never leaks into the next.
 */

interface RhythmState {
  hands: RhythmHands | null;
}
const rhythmStore = defineScopedStore<RhythmState>({ hands: null });

export const RhythmStoreProvider = rhythmStore.Provider;

/** Reactive read — re-renders the caller (e.g. the provider) on hand changes. */
export function useRhythmHands(): RhythmHands | null {
  return rhythmStore.useSelector((s) => s.hands, []);
}

/**
 * Imperative setter for the per-surface hands. The `rhythm-controls` observer
 * calls it to sync the persisted per-song setting; the controls call it for
 * instant optimistic feedback. `setState` early-returns on an unchanged value
 * (Object.is bail), so no spurious listener fan-out.
 */
export function useSetRhythmHands(): (hands: RhythmHands | null) => void {
  const store = rhythmStore.useStoreApi();
  return useMemo(
    () => (hands: RhythmHands | null) => store.setState({ hands }),
    [store],
  );
}
