import type {
  FieldDef,
  FieldExtensionProps,
} from "@plugins/primitives/plugins/data-view/web";
import type { Song } from "@plugins/apps/plugins/sonata/plugins/library/core";
import { midiColumns } from "../../core";

/**
 * Field extension contributed into the library's `Library.Fields` factory: the
 * note-bearing track count of a song's MIDI file, read off every library row's
 * `midi` columns. Being a `FieldDef` bound to its column rather than a private
 * per-card slot, it is a card property row, a table column, a sort key and a
 * filter dimension at once — sorted and filtered on the server.
 *
 * `value` is `null` and `cell` renders nothing for a song with no MIDI, so the
 * library card stays source-agnostic.
 */
const MIDI_FIELDS: FieldDef<Song>[] = [
  {
    id: "trackCount",
    label: "Tracks",
    type: "int",
    width: "5rem",
    align: "end",
    value: (s) => midiColumns.read(s).trackCount,
    cell: (s) => {
      const n = midiColumns.read(s).trackCount;
      if (n === null) return null;
      return `${n} ${n === 1 ? "track" : "tracks"}`;
    },
    sortable: true,
    column: midiColumns.column("trackCount"),
  },
];

export function MidiFields({ render }: FieldExtensionProps<Song>) {
  return <>{render(MIDI_FIELDS)}</>;
}
