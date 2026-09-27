import { useEffect } from "react";
import {
  transposeSetting,
  useMountedSongId,
  useWriteSongSetting,
} from "@plugins/apps/plugins/sonata/plugins/shell/web";
import { useLiveRow } from "@plugins/network/plugins/live/web";
import { transposes } from "../../shared/resources";

/**
 * Headless observer of the `transposeSetting` (`Sonata.SongSetting`, mounted
 * afresh for each loaded song): syncs that song's persisted transpose offset
 * into the loaded song, whose score pipeline reads it to shift the whole song.
 *
 * It writes only a settled answer: a newly loaded song's settings start
 * pending, so until this song's row arrives nothing renders under the previous
 * song's offset or a stand-in `0` — and a write for a song no longer loaded is
 * dropped. An absent row (`found: false`) IS the song's offset: `0`.
 */
export function TransposeObserver() {
  const songId = useMountedSongId();
  const setTranspose = useWriteSongSetting(transposeSetting);
  const row = useLiveRow(transposes, songId);
  // The row read reduced to the value it settles to — `undefined` while it is
  // pending — so the effect below runs on a real change only.
  const semitones = row.pending ? undefined : row.found ? row.row.semitones : 0;

  useEffect(() => {
    if (semitones === undefined) return;
    setTranspose(songId, semitones);
  }, [songId, semitones, setTranspose]);

  return null;
}
