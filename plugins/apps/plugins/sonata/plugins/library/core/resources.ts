import { z } from "zod";
import { resourceDescriptor } from "@plugins/primitives/plugins/live-state/core";
import { SongSchema } from "./schemas";
import type { Song } from "./schemas";

/**
 * The reactive list of saved songs, ordered newest-first. Seeded with `[]` so
 * the gallery renders an empty grid (no pending flash) before the first push.
 * The server backs this with a `push`-mode live resource that `.notify()`s
 * after every create/delete mutation.
 */
export const songsResource = resourceDescriptor<Song[]>(
  "sonata-songs",
  z.array(SongSchema),
  [],
);
