import { integer, timestamp } from "drizzle-orm/pg-core";
import { _songs } from "@plugins/apps/plugins/sonata/plugins/library/server";
import { defineExtension } from "@plugins/infra/plugins/entity-extensions/server";

// Mutable per-song playback rollup attached to the library's `sonata_songs` row
// via the entity-extensions primitive (1:1 side-table, FK CASCADE on song
// delete). Owned here so the library schema stays stable and this feature is
// independently composable. Table: `sonata_songs_ext_playback`.
export const songPlayback = defineExtension(_songs, "playback", {
  playCount: integer("play_count").notNull().default(0),
  lastPlayedAt: timestamp("last_played_at", { withTimezone: true }),
});
export const _songPlaybackExt = songPlayback.table; // drizzle-kit discovery
