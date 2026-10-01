import type {
  FieldDef,
  FieldExtensionProps,
} from "@plugins/primitives/plugins/data-view/web";
import type { Song } from "@plugins/apps/plugins/sonata/plugins/library/core";
import { midiColumns } from "@plugins/apps/plugins/sonata/plugins/sources/plugins/midi/core";
import { Badge } from "@plugins/primitives/plugins/css/plugins/badge/web";

/**
 * Field extension contributed into the library's `Library.Fields` factory: does
 * this folder-imported song's backing `.mid` file still exist on disk? The song
 * stays (and stays playable from its copied attachment) but is visibly flagged.
 *
 * A `bool` field rather than a badge-only render slot, so "show me the songs
 * whose file vanished" is a filter preset rather than a visual scan — run on the
 * server, over the MIDI source's `sourceMissing` column. `cell` overrides the
 * inherited checkbox: a present file renders nothing, so an ordinary song's card
 * is unchanged.
 *
 * Its own contributor, separate from the MIDI source's — `sourceMissing` is this
 * plugin's semantics, and one contributor per plugin is the boundary rule. The
 * value itself rides on every library row as one of the MIDI source's columns
 * (`midiColumns`, the source's public core).
 */
const SOURCE_MISSING_FIELDS: FieldDef<Song>[] = [
  {
    id: "sourceMissing",
    // "File", not "Source": the library already ships a `source` enum field
    // (which input source a song came from), and two columns both headed
    // "Source" is unreadable in the table. This one is about the backing
    // `.mid` file on disk, so the badge says the same word the column does.
    label: "File",
    type: "bool",
    value: (s) => midiColumns.read(s).sourceMissing,
    cell: (s) =>
      midiColumns.read(s).sourceMissing ? (
        <Badge variant="destructive">File missing</Badge>
      ) : null,
    column: midiColumns.column("sourceMissing"),
  },
];

export function SourceMissingField({ render }: FieldExtensionProps<Song>) {
  return <>{render(SOURCE_MISSING_FIELDS)}</>;
}
