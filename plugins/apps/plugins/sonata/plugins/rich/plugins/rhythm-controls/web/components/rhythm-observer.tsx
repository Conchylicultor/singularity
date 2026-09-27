import { useEffect } from "react";
import {
  grooveSetting,
  useMountedSongId,
  useWriteSongSetting,
} from "@plugins/apps/plugins/sonata/plugins/shell/web";
import { useLiveRow } from "@plugins/network/plugins/live/web";
import { rhythms } from "../../shared/resources";

/**
 * Headless observer of the `grooveSetting` (`Sonata.SongSetting`, mounted
 * afresh for each loaded song): syncs that song's persisted rhythm groove into
 * the loaded song, whose score pipeline reads it to re-voice the chords with
 * the groove.
 *
 * It writes only a settled answer: a newly loaded song's settings start
 * pending, so until this song's row arrives nothing renders under the previous
 * song's groove or a stand-in "no groove" — and a write for a song no longer
 * loaded is dropped. A settled `null` — an absent row, or `enabled` off — IS
 * the song's groove: block chords.
 */
export function RhythmObserver() {
  const songId = useMountedSongId();
  const setGroove = useWriteSongSetting(grooveSetting);
  const row = useLiveRow(rhythms, songId);
  // The row read reduced to what the effect needs: whether it has settled, and
  // the row itself (the cache's own object, identity-stable until it changes) —
  // so the effect runs on a real change only.
  const settled = !row.pending;
  const persisted = !row.pending && row.found ? row.row : null;

  useEffect(() => {
    if (!settled) return;
    setGroove(
      songId,
      persisted && persisted.enabled
        ? {
            hands: { bass: persisted.bass, chord: persisted.chord },
            bassFigurationId: persisted.bassPatternId,
            chordFigurationId: persisted.chordPatternId,
          }
        : null,
    );
  }, [songId, settled, persisted, setGroove]);

  return null;
}
