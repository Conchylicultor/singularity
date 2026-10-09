import { eq } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { _songs } from "@plugins/apps/plugins/sonata/plugins/library/server";
import { songIdKind } from "@plugins/apps/plugins/sonata/plugins/library/core";
import type { IdReferent } from "@plugins/ids/server";

/** A `song-<id>`'s title, for the id registry and text a model reads. */
export async function resolveSongReferent(id: string): Promise<IdReferent> {
  const [song] = await db
    .select({ title: _songs.title })
    .from(_songs)
    .where(eq(_songs.id, songIdKind.key(id)))
    .limit(1);
  return song ? { found: true, title: song.title } : { found: false };
}
