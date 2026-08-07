import { useMemo } from "react";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { songMidiResource, type SongMidiRow } from "../shared/resources";

/**
 * Every song's MIDI row indexed by song id — the batch twin of
 * {@link useSongMidi}, for a `FieldDef.value` closure that must answer for any
 * row synchronously. An empty map while the resource is pending is correct: a
 * missing entry already means "this song carries no MIDI", which is the same
 * answer a settled resource gives for a non-MIDI song.
 */
export function useSongMidiMap(): Map<string, SongMidiRow> {
  const result = useResource(songMidiResource);
  return useMemo(() => {
    if (result.pending) return new Map<string, SongMidiRow>();
    return new Map(result.data.map((r) => [r.songId, r]));
  }, [result]);
}

/** One song's MIDI data, or null if it carries no MIDI (reactive). */
export function useSongMidi(
  songId: string | null | undefined,
): SongMidiRow | null {
  const result = useResource(songMidiResource);
  if (!songId) return null;
  if (result.pending) return null;
  return result.data.find((r) => r.songId === songId) ?? null;
}
