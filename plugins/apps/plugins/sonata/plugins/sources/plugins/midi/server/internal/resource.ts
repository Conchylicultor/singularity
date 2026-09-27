import { db } from "@plugins/database/server";
import { serveValue } from "@plugins/network/plugins/live/server";
import { songMidiRows } from "../../shared/resources";
import { songMidi } from "./tables";

// Recomputed on every write to `sonata_songs_ext_midi`, which the loader's
// captured read-set routes here. `wireColumns` leaves the server-only
// `contentHash` unselected, so the dedup key never reaches the wire.
export const songMidiRowsServed = serveValue(songMidiRows, {
  source: "db",
  unbounded: {
    reason:
      "one row per MIDI song (sonata_songs_ext_midi) — whole-table only until Resources item 7: the library's Tracks / File-missing field extensions sort and filter every song client-side, and a bounded read needs joined side-table sort/filter columns on the songs collection, the host rows in data-view's FieldExtensionProps, and live-window paging in DataView",
  },
  loader: () => db.select(songMidi.wireColumns).from(songMidi.table),
});
