import { useEffect, useRef } from "react";
import { useSonata } from "@plugins/apps/plugins/sonata/plugins/shell/web";
import { fetchEndpoint } from "@plugins/infra/plugins/endpoints/web";
import { recordPlay } from "../../shared/endpoints";

/**
 * Headless: records a play when the open song's playback first starts. Mounted
 * via `Sonata.Effect` (always inside the provider) so it can read context.
 *
 * Counts once per *open* (keyed on `songOpenEpoch`): pause→resume within one open
 * does not re-count, but reopening the song — even the same one — re-arms it.
 */
export function RecordPlayObserver() {
  const { currentSongId, isPlaying, songOpenEpoch } = useSonata();
  const prevPlaying = useRef(false);
  const recordedEpoch = useRef<number | null>(null);

  useEffect(() => {
    const started = !prevPlaying.current && isPlaying;
    prevPlaying.current = isPlaying;
    if (started && currentSongId && recordedEpoch.current !== songOpenEpoch) {
      recordedEpoch.current = songOpenEpoch;
      void fetchEndpoint(recordPlay, { id: currentSongId });
    }
  }, [isPlaying, currentSongId, songOpenEpoch]);

  return null;
}
