import { desc } from "drizzle-orm";
import { z } from "zod";
import { db } from "@plugins/database/server";
import { defineResource } from "@plugins/framework/plugins/server-core/core";
import { SongSchema } from "../../core/schemas";
import type { Song } from "../../core/schemas";
import { songsResource } from "../../core/resources";
import { _songs } from "./tables";

/** Map a DB row to the wire `Song` shape (Date → ISO string). */
export function toSong(row: typeof _songs.$inferSelect): Song {
  return {
    id: row.id,
    title: row.title,
    composer: row.composer,
    durationSec: row.durationSec,
    endBeat: row.endBeat,
    createdAt: row.createdAt.toISOString(),
    source: row.source,
  };
}

export const songsLiveResource = defineResource<Song[]>({
  key: songsResource.key,
  mode: "push",
  schema: z.array(SongSchema),
  loader: async () =>
    (await db.select().from(_songs).orderBy(desc(_songs.createdAt))).map(toSong),
});
