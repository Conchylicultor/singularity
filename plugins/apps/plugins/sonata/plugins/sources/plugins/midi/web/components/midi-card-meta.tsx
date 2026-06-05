import type { Song } from "@plugins/apps/plugins/sonata/plugins/library/core";
import { useSongMidi } from "../hooks";

/**
 * Per-card MIDI metadata (note-bearing track count), contributed to the
 * library's `CardMeta` slot. Renders nothing for a song without MIDI data, so
 * the library card stays source-agnostic.
 */
export function MidiCardMeta({ song }: { song: Song }) {
  const midi = useSongMidi(song.id);
  if (!midi) return null;
  return (
    <div className="text-2xs text-muted-foreground">
      <span className="tabular-nums">
        {midi.trackCount} {midi.trackCount === 1 ? "track" : "tracks"}
      </span>
    </div>
  );
}
