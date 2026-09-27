import { useEffect } from "react";
import {
  chordModeSetting,
  useMountedSongId,
  useWriteSongSetting,
} from "@plugins/apps/plugins/sonata/plugins/shell/web";
import { useLiveRow } from "@plugins/network/plugins/live/web";
import { chordModes } from "../../shared/resources";

/**
 * Headless observer of the `chordModeSetting` (`Sonata.SongSetting`, mounted
 * afresh for each loaded song): syncs that song's persisted chord mode into the
 * loaded song, whose score pipeline reads it to decide whether to run the
 * second, all-chords voicing pass.
 *
 * It writes only a settled answer: a newly loaded song's settings start
 * pending, so until this song's row arrives nothing renders under the previous
 * song's mode or a stand-in "off" — and a write for a song no longer loaded is
 * dropped. An absent row (`found: false`) IS the song's mode: off.
 */
export function ChordModeObserver() {
  const songId = useMountedSongId();
  const setChordMode = useWriteSongSetting(chordModeSetting);
  const row = useLiveRow(chordModes, songId);
  // The row read reduced to the value it settles to — `undefined` while it is
  // pending — so the effect below runs on a real change only.
  const enabled = row.pending ? undefined : row.found && row.row.enabled;

  useEffect(() => {
    if (enabled === undefined) return;
    setChordMode(songId, enabled);
  }, [songId, enabled, setChordMode]);

  return null;
}
