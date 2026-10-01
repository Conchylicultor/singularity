import { serveColumns } from "@plugins/network/plugins/live/server";
import { playbackColumns } from "../../core";
import { songPlayback } from "./tables";

// The library's play-stat columns, read through the playback extension: LEFT,
// 1:1 on the song id. A recorded play refills exactly that song in the library
// tuples that read the join — and loads nothing in a tuple that only projects
// it and does not hold the song.
export const playbackColumnsServed = serveColumns(playbackColumns, {
  join: songPlayback.join("playback"),
});
