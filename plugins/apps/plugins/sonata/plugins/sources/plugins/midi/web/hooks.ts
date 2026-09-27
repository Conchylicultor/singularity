import { useMemo } from "react";
import { useLive } from "@plugins/network/plugins/live/web";
import { songMidiRows, type SongMidiRow } from "../shared/resources";

/**
 * Every song's MIDI row indexed by song id, for a `FieldDef.value` closure that
 * must answer for any row synchronously. An empty map while the value is
 * pending is correct: a missing entry already means "this song carries no
 * MIDI", which is the same answer a settled value gives for a non-MIDI song.
 */
export function useSongMidiMap(): Map<string, SongMidiRow> {
  const result = useLive(songMidiRows);
  // Accepted pending collapse until Resources item 7 (joined columns on songs).
  return useMemo(() => {
    if (result.pending) return new Map<string, SongMidiRow>();
    return new Map(result.data.map((r) => [r.songId, r]));
  }, [result]);
}
