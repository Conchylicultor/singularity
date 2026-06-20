import { z } from "zod";
import { resourceDescriptor } from "@plugins/primitives/plugins/live-state/core";
import { SongSchema } from "./schemas";
import type { Song } from "./schemas";

/**
 * The reactive list of saved songs, ordered newest-first. The server backs
 * this with a `push`-mode live resource that the DB change-feed invalidates
 * automatically on every create/delete/update of the songs table. While
 * `pending`, the library renders DataView's loading skeleton — never the empty
 * state.
 */
export const songsResource = resourceDescriptor<Song[]>(
  "sonata-songs",
  z.array(SongSchema),
  [],
);
