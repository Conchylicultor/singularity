import { useResource } from "@plugins/primitives/plugins/live-state/web";
import {
  songMidiResource,
  type SongMidiRow,
} from "../shared/resources";

/** One song's MIDI data, or null if it carries no MIDI (reactive). */
export function useSongMidi(
  songId: string | null | undefined,
): SongMidiRow | null {
  const result = useResource(songMidiResource);
  if (!songId) return null;
  if (result.pending) return null;
  return result.data.find((r) => r.songId === songId) ?? null;
}
