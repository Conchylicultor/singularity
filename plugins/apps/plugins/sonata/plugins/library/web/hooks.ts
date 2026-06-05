import { useCallback } from "react";
import { useSonata } from "@plugins/apps/plugins/sonata/plugins/shell/web";
import { Library } from "./slots";

/**
 * Open a song into the player. Collects every registered source's raw for the
 * song via the generic `Library.Source` registry — `hydrate(songId)` per source,
 * in parallel — then loads them all in one shot through `setRawMap` (which
 * replaces the prior song's inputs) and switches to the player.
 *
 * Source-agnostic by construction: the library never names MIDI (or any source).
 * A source with no data for the song returns `undefined` and is skipped, so a
 * song can carry any subset of sources. Used by both the gallery cards and each
 * source's `AddAction` (open-immediately-after-create).
 */
export function useOpenSong(): (song: { id: string; title: string }) => Promise<void> {
  const sources = Library.Source.useContributions();
  const { setRawMap, openPlayer } = useSonata();
  return useCallback(
    async (song) => {
      // Collect each source's raw concurrently into the map. Sources write
      // distinct keys, so concurrent assignment is race-free; Promise.all
      // barriers before we load. A source with no data returns undefined → skip.
      const rawMap: Record<string, unknown> = {};
      await Promise.all(
        sources.map(async (s) => {
          const raw = await s.hydrate(song.id);
          if (raw !== undefined) rawMap[s.sourceId] = raw;
        }),
      );
      setRawMap(rawMap);
      openPlayer({ id: song.id, title: song.title });
    },
    [sources, setRawMap, openPlayer],
  );
}
