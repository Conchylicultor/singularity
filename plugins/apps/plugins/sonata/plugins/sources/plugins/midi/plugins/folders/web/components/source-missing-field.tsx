import { useMemo } from "react";
import type {
  FieldDef,
  FieldExtensionProps,
} from "@plugins/primitives/plugins/data-view/web";
import type { Song } from "@plugins/apps/plugins/sonata/plugins/library/core";
import { useSongMidiMap } from "@plugins/apps/plugins/sonata/plugins/sources/plugins/midi/web";
import { Badge } from "@plugins/primitives/plugins/css/plugins/badge/web";

/**
 * Field extension contributed into the library's `Library.Fields` factory: does
 * this folder-imported song's backing `.mid` file still exist on disk? The song
 * stays (and stays playable from its copied attachment) but is visibly flagged.
 *
 * A `bool` field rather than a badge-only render slot, so "show me the songs
 * whose file vanished" is a filter preset rather than a visual scan. `cell`
 * overrides the inherited checkbox: a present file renders nothing, so an
 * ordinary song's card is unchanged.
 *
 * Its own contributor, separate from the MIDI source's — `sourceMissing` is this
 * plugin's semantics, and one contributor per plugin is the boundary rule. It
 * reads the same live MIDI rollup through `useSongMidiMap`, the source's public
 * hook, so no new endpoint is needed.
 */
export function SourceMissingField({ render }: FieldExtensionProps<Song>) {
  const map = useSongMidiMap();
  const fields = useMemo<FieldDef<Song>[]>(
    () => [
      {
        id: "sourceMissing",
        // "File", not "Source": the library already ships a `source` enum field
        // (which input source a song came from), and two columns both headed
        // "Source" is unreadable in the table. This one is about the backing
        // `.mid` file on disk, so the badge says the same word the column does.
        label: "File",
        type: "bool",
        value: (s) => map.get(s.id)?.sourceMissing ?? false,
        cell: (s) =>
          map.get(s.id)?.sourceMissing ? (
            <Badge variant="destructive">File missing</Badge>
          ) : null,
      },
    ],
    [map],
  );
  return <>{render(fields)}</>;
}
