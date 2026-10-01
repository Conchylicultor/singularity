import { serveColumns } from "@plugins/network/plugins/live/server";
import { midiColumns } from "../../core";
import { songMidi } from "./tables";

// The library's MIDI columns, read through the MIDI extension: LEFT, 1:1 on the
// song id (the server-only `contentHash` is not a wire column, so it cannot be
// bound). An import or a folder reconcile refills exactly the songs it writes.
export const midiColumnsServed = serveColumns(midiColumns, {
  join: songMidi.join("midi"),
});
