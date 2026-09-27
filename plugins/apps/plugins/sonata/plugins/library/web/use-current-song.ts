import { useMemo } from "react";
import type { ResourceResult } from "@plugins/primitives/plugins/live-state/web";
import { useLive } from "@plugins/network/plugins/live/web";
import { useSonata } from "@plugins/apps/plugins/sonata/plugins/shell/web";
import { songs, type Song } from "../core";

/**
 * The canonical row for the song currently open in the player, straight from
 * the live `songs` value. `pending` while it loads; `null` when no song is
 * open, or the open id is not in the list. THE read path for the open song's
 * title — the shell context deliberately keeps no copy.
 *
 * The `pending` discriminant is preserved (never collapsed into a default —
 * `no-pending-data-collapse`): callers gate on it via `matchResource` /
 * `ResourceView`, so an inline-editable title is only ever seeded from a
 * settled value. A stale-while-revalidate payload is projected through too, so
 * the row survives a refetch the same way the underlying list does.
 */
export function useCurrentSong(): ResourceResult<Song | null> {
  const { currentSongId } = useSonata();
  const library = useLive(songs);
  return useMemo<ResourceResult<Song | null>>(() => {
    const pick = (list: readonly Song[]): Song | null =>
      currentSongId === null
        ? null
        : (list.find((s) => s.id === currentSongId) ?? null);

    if (library.pending) {
      return {
        pending: true,
        error: library.error,
        // Keep `stale` absent (not `null`) when upstream has none — the two mean
        // different things to a stale-while-revalidate consumer.
        ...(library.stale === undefined ? {} : { stale: pick(library.stale) }),
        refetch: library.refetch,
      };
    }
    return {
      pending: false,
      data: pick(library.data),
      refetch: library.refetch,
    };
  }, [library, currentSongId]);
}
