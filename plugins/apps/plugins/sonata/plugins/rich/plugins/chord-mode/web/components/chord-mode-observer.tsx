import { useEffect } from "react";
import {
  useSetChordMode,
  useSonata,
} from "@plugins/apps/plugins/sonata/plugins/shell/web";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { chordModeResource } from "../../shared/resources";

/**
 * Headless: syncs the open song's persisted chord mode into the shell's
 * per-surface store, which the score pipeline reads to decide whether to run
 * the second, all-chords voicing pass. Mounted via `Sonata.Effect` (always inside
 * the provider, which is itself inside the chord-mode store provider) so it can
 * read context and write the store.
 *
 * This is the sole owner of "which song's mode is in force": it writes the
 * current song's value, and writes `false` when no song is open — otherwise the
 * previous song's mode would leak into the next. It waits for the resource to
 * resolve before writing, so a still-loading rollup never collapses to a false
 * "off".
 */
export function ChordModeObserver() {
  const { currentSongId } = useSonata();
  const setChordMode = useSetChordMode();
  const result = useResource(chordModeResource);

  useEffect(() => {
    if (result.pending) return; // wait for truth before touching the store
    const enabled = currentSongId
      ? (result.data.find((r) => r.songId === currentSongId)?.enabled ?? false)
      : false;
    setChordMode(enabled);
  }, [result, currentSongId, setChordMode]);

  return null;
}
