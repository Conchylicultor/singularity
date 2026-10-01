import { serveCollection } from "@plugins/network/plugins/live/server";
import { songLibrary } from "../../core/resources";
import { _songs } from "./tables";

// The song library, served off `sonata_songs`. It is `contributed`, so its
// three resources compile at boot, once every `LiveColumns.Serve` naming it
// (playback-history's plays, the MIDI source's tracks and file-missing flag) is
// collected: each contributor's extension joins in LEFT, 1:1 on the song id,
// and its writes refill exactly the songs they key — as `value` in a tuple that
// only projects them, `membership` in one that sorts or filters by them.
export const songLibraryServed = serveCollection(songLibrary, {
  from: _songs,
});
