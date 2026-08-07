import { useMemo } from "react";
import type {
  FieldDef,
  FieldExtensionProps,
} from "@plugins/primitives/plugins/data-view/web";
import type { Song } from "@plugins/apps/plugins/sonata/plugins/library/core";
import { useSongMidiMap } from "../hooks";

/**
 * Field extension contributed into the library's `Library.Fields` factory: the
 * note-bearing track count of a song's MIDI file, read off this source's own
 * live rollup. Being a `FieldDef` rather than a private per-card slot, it is a
 * card property row, a table column, a sort key and a filter dimension at once.
 *
 * `value` is `null` and `cell` renders nothing for a song with no MIDI, so the
 * library card stays source-agnostic — exactly what the old `MidiCardMeta`
 * strip did, minus the second render seam.
 */
export function MidiFields({ render }: FieldExtensionProps<Song>) {
  const map = useSongMidiMap();
  const fields = useMemo<FieldDef<Song>[]>(
    () => [
      {
        id: "trackCount",
        label: "Tracks",
        type: "int",
        width: "5rem",
        align: "end",
        value: (s) => map.get(s.id)?.trackCount ?? null,
        cell: (s) => {
          const n = map.get(s.id)?.trackCount;
          if (n === undefined) return null;
          return `${n} ${n === 1 ? "track" : "tracks"}`;
        },
        sortable: true,
      },
    ],
    [map],
  );
  return <>{render(fields)}</>;
}
