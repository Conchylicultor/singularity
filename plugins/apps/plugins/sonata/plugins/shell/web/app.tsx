import { useMemo } from "react";
import {
  useLibrarySong,
  useLoadCount,
} from "@plugins/apps/plugins/sonata/plugins/document/web";

/**
 * The Sonata APP's view of its song: which library song is in play. Derived
 * from the player scope's loaded document — never kept beside it — so it holds
 * the song that will sound when Play is pressed, whether a player pane shows it
 * or it plays in the background from the library.
 */
export interface SonataAppValue {
  /** Id of the library song loaded in the app (null before any load). Lets
   *  app-scoped effects attribute a play to a specific song, and the library
   *  show which song is playing. */
  currentSongId: string | null;
  /**
   * Bumped by every load of a song — a play from the library, a player open
   * that loads, a reload of the same song included. Effects that should fire
   * once per load (recording a play on the first Play press, a source's
   * persist observer skipping the raw a load handed it) key their "already
   * handled" guard on this, so pause→resume within one load does not re-arm
   * them. Opening the player on the song already loaded is not a load: it
   * keeps playing where it is.
   */
  songLoadEpoch: number;
}

/** Read the Sonata app state. Must be called inside the app's player scope. */
export function useSonataApp(): SonataAppValue {
  const song = useLibrarySong();
  const songLoadEpoch = useLoadCount();
  const currentSongId = song.kind === "library" ? song.songId : null;
  return useMemo(
    () => ({ currentSongId, songLoadEpoch }),
    [currentSongId, songLoadEpoch],
  );
}
