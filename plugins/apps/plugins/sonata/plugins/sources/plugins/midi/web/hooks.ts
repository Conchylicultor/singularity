import { useMemo } from "react";
import { useLive } from "@plugins/network/plugins/live/web";
import { foldResource } from "@plugins/primitives/plugins/live-state/web";
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
  // A failed read keeps its last-seen rows (`stale`), else the same empty map:
  // the column degrades to "no MIDI", and live-state reports the failure.
  return useMemo(() => {
    const index = (rows: readonly SongMidiRow[]) =>
      new Map(rows.map((r) => [r.songId, r]));
    return foldResource(result, {
      loading: () => new Map<string, SongMidiRow>(),
      error: (_error, stale) =>
        stale === undefined ? new Map<string, SongMidiRow>() : index(stale),
      ready: index,
    });
  }, [result]);
}
