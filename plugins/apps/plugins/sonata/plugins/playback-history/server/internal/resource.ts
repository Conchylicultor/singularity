import { db } from "@plugins/database/server";
import { serveValue } from "@plugins/network/plugins/live/server";
import { playbackHistory } from "../../shared/resources";
import { songPlayback } from "./tables";

// Recomputed on every write to `sonata_songs_ext_playback` (a recorded play),
// which the loader's captured read-set routes here.
export const playbackHistoryServed = serveValue(playbackHistory, {
  source: "db",
  unbounded: {
    reason:
      "one row per played song (sonata_songs_ext_playback) — whole-table only until Resources item 7: the library's Plays / Last-played field extension sorts every song client-side, and a bounded read needs joined side-table sort/filter columns on the songs collection, the host rows in data-view's FieldExtensionProps, and live-window paging in DataView",
  },
  loader: () => db.select(songPlayback.wireColumns).from(songPlayback.table),
});
