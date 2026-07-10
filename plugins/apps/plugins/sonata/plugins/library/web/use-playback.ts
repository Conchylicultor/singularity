import { useEventCallback } from "@plugins/primitives/plugins/latest-ref/web";
import { useSonata } from "@plugins/apps/plugins/sonata/plugins/shell/web";
import { Library } from "./slots";

/**
 * Background playback for the library: play a song in place (no navigation) by
 * hydrating every registered source's raw, loading it into the shared transport
 * (`setRawMap` + `setCurrentSong`), then arming `requestPlayOnLoad` so playback
 * starts as soon as the recomposed score is ready. Because `SonataProvider` and
 * the audio engine are mounted above the pane router, the song keeps playing
 * while the user stays on the gallery/table.
 *
 * `togglePlaySong` is play/pause-aware: clicking the already-current song
 * toggles it (resume/pause from the live cursor, no reload); clicking a
 * different song loads + auto-plays it from the top. Stable identity
 * (`useEventCallback`) so it can be passed to memoized rows; the returned
 * `currentSongId`/`isPlaying` are reactive so callers re-render their icon.
 */
export function useSonataPlayback(): {
  togglePlaySong: (song: { id: string; title: string }) => void;
  currentSongId: string | null;
  isPlaying: boolean;
} {
  const {
    currentSongId,
    isPlaying,
    setRawMap,
    setCurrentSong,
    requestPlayOnLoad,
    play,
    stop,
  } = useSonata();
  const sources = Library.Source.useContributions();

  const togglePlaySong = useEventCallback(
    (song: { id: string; title: string }) => {
      if (currentSongId === song.id) {
        if (isPlaying) stop();
        else play();
        return;
      }
      void (async () => {
        const rawMap: Record<string, unknown> = {};
        await Promise.all(
          sources.map(async (s) => {
            const raw = await s.hydrate(song.id);
            if (raw !== undefined) rawMap[s.sourceId] = raw;
          }),
        );
        setRawMap(rawMap);
        setCurrentSong(song.id);
        requestPlayOnLoad();
      })();
    },
  );

  return { togglePlaySong, currentSongId, isPlaying };
}
