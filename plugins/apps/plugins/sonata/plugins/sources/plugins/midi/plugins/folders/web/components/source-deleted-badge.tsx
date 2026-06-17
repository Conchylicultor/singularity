import type { Song } from "@plugins/apps/plugins/sonata/plugins/library/core";
import { useSongMidi } from "@plugins/apps/plugins/sonata/plugins/sources/plugins/midi/web";
import { Badge } from "@plugins/primitives/plugins/css/plugins/badge/web";

/**
 * Library-card badge for a folder-imported song whose backing `.mid` file has
 * disappeared from disk. The song stays (and stays playable from its copied
 * attachment) but is visibly flagged. Renders nothing for songs with no MIDI
 * row or whose source is present. Reads the same live MIDI resource the cards
 * already consume, so no new endpoint is needed.
 */
export function SourceDeletedBadge({ song }: { song: Song }) {
  const midi = useSongMidi(song.id);
  if (!midi || !midi.sourceMissing) return null;
  return (
    <Badge variant="destructive" size="sm">
      Source deleted
    </Badge>
  );
}
