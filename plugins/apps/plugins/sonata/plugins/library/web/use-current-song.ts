import { useMemo } from "react";
import {
  mapResource,
  type ResourceResult,
} from "@plugins/primitives/plugins/live-state/web";
import { useLive } from "@plugins/network/plugins/live/web";
import { useSonata } from "@plugins/apps/plugins/sonata/plugins/shell/web";
import { songs, type Song } from "../core";

/**
 * The canonical row for the song currently open in the player, straight from
 * the live `songs` value. loading while it loads; `null` when no song is
 * open, or the open id is not in the list. THE read path for the open song's
 * title — the shell context deliberately keeps no copy.
 *
 * The read's state is preserved (never collapsed into a default —
 * `no-pending-data-collapse`): callers gate on it via `matchResource` /
 * `ResourceView`, so an inline-editable title is only ever seeded from a
 * ready value. A last-known-good (`stale`) list is projected through too, so
 * the row survives a failure the same way the underlying list does.
 */
export function useCurrentSong(): ResourceResult<Song | null> {
  const { currentSongId } = useSonata();
  const library = useLive(songs);
  return useMemo(() => {
    const pick = (list: readonly Song[]): Song | null =>
      currentSongId === null
        ? null
        : (list.find((s) => s.id === currentSongId) ?? null);
    // `mapResource` keeps the loading and error arms (and projects a `stale`
    // list through the same pick).
    return mapResource(library, pick);
  }, [library, currentSongId]);
}
