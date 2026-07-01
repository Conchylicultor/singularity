import { desc } from "drizzle-orm";
import { z } from "zod";
import { db } from "@plugins/database/server";
import { defineResource } from "@plugins/framework/plugins/server-core/core";
import { SongSchema } from "../../core/schemas";
import type { Song } from "../../core/schemas";
import { songsResource } from "../../core/resources";
import { _songs } from "./tables";

// `_songs.$inferSelect ≡ Song` by construction — both derive from the single
// `songFields` record (core) — so the loader returns `db.select()` rows verbatim
// (newest-first) with no projection and no `toSong` helper.
export const songsLiveResource = defineResource<Song[]>({
  key: songsResource.key,
  mode: "push",
  schema: z.array(SongSchema),
  loader: async () =>
    db.select().from(_songs).orderBy(desc(_songs.createdAt)),
});
