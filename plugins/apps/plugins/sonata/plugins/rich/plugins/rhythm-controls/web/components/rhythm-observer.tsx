import { useEffect } from "react";
import {
  useSetRhythmHands,
  useSonata,
} from "@plugins/apps/plugins/sonata/plugins/shell/web";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { rhythmResource } from "../../shared/resources";

/**
 * Headless: syncs the open song's persisted rhythm groove into the shell's
 * per-surface store, which the score pipeline reads to re-voice the chords with
 * the groove. Mounted via `Sonata.Effect` (always inside the provider, itself
 * inside the rhythm store provider) so it can read context and write the store.
 *
 * This is the sole owner of "which song's hands are in force": it writes the
 * current song's hands, and writes `null` when no song is open, when the row is
 * absent, or when `enabled` is false — otherwise the previous song's groove
 * would leak into the next. It waits for the resource to resolve before writing,
 * so a still-loading rollup never collapses to a false default.
 */
export function RhythmObserver() {
  const { currentSongId } = useSonata();
  const setHands = useSetRhythmHands();
  const result = useResource(rhythmResource);

  useEffect(() => {
    if (result.pending) return; // wait for truth before touching the store
    if (!currentSongId) {
      setHands(null);
      return;
    }
    const row = result.data.find((r) => r.songId === currentSongId);
    setHands(row && row.enabled ? { bass: row.bass, chord: row.chord } : null);
  }, [result, currentSongId, setHands]);

  return null;
}
