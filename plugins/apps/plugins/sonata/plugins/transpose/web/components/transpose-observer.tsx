import { useEffect } from "react";
import {
  useSetTransposeSemitones,
  useSonata,
} from "@plugins/apps/plugins/sonata/plugins/shell/web";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { transposeResource } from "../../shared/resources";

/**
 * Headless: syncs the open song's persisted transpose offset into the shell's
 * per-surface store, which the score pipeline reads to shift the whole song.
 * Mounted via `Sonata.Effect` (always inside the provider, which is itself inside
 * the transpose store provider) so it can read context and write the store.
 *
 * This is the sole owner of "which song's offset is in force": it writes the
 * current song's value, and writes `0` when no song is open — otherwise the
 * previous song's offset would leak into the next. It waits for the resource to
 * resolve before writing, so a still-loading rollup never collapses to a false
 * `0`.
 */
export function TransposeObserver() {
  const { currentSongId } = useSonata();
  const setTranspose = useSetTransposeSemitones();
  const result = useResource(transposeResource);

  useEffect(() => {
    if (result.pending) return; // wait for truth before touching the store
    const semitones = currentSongId
      ? (result.data.find((r) => r.songId === currentSongId)?.semitones ?? 0)
      : 0;
    setTranspose(semitones);
  }, [result, currentSongId, setTranspose]);

  return null;
}
