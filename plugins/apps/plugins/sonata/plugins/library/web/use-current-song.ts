import { useMemo } from "react";
import {
  useResource,
  type ResourceResult,
} from "@plugins/primitives/plugins/live-state/web";
import { useSonata } from "@plugins/apps/plugins/sonata/plugins/shell/web";
import { songsResource, type Song } from "../core";

/**
 * The canonical row for the song currently open in the player, straight from
 * `songsResource`. `pending` while the resource loads; `null` when no song is
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
  const songs = useResource(songsResource);
  return useMemo<ResourceResult<Song | null>>(() => {
    const pick = (list: readonly Song[]): Song | null =>
      currentSongId === null
        ? null
        : (list.find((s) => s.id === currentSongId) ?? null);

    if (songs.pending) {
      return {
        pending: true,
        error: songs.error,
        // Keep `stale` absent (not `null`) when upstream has none — the two mean
        // different things to a stale-while-revalidate consumer.
        ...(songs.stale === undefined ? {} : { stale: pick(songs.stale) }),
        refetch: songs.refetch,
      };
    }
    return { pending: false, data: pick(songs.data), refetch: songs.refetch };
  }, [songs, currentSongId]);
}
