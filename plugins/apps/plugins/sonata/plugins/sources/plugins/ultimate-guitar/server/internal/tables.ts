import { integer, text } from "drizzle-orm/pg-core";
import { _songs } from "@plugins/apps/plugins/sonata/plugins/library/server";
import { defineExtension } from "@plugins/infra/plugins/entity-extensions/server";

// This source's persisted data for a song — the full normalized UgTab, attached
// to the library's `sonata_songs` row via the entity-extensions primitive (1:1
// side-table, FK CASCADE on song delete). The persisted columns ARE the UgTab
// fields, so `hydrate` reconstructs the exact `raw` that `compile()` consumes and
// the library schema stays source-agnostic. Table: `sonata_songs_ext_ultimate_guitar`.
//
// We deliberately store the parsed source-of-truth (`content` markup + metadata),
// NOT a cached parse: `parseUgTab` is pure and cheap, so a parsed-cache column
// would only add a staleness footgun (a parser change would serve a stale tree).
export const songUltimateGuitar = defineExtension(_songs, "ultimate_guitar", {
  tabId: text("tab_id").notNull(),
  songName: text("song_name").notNull(),
  artistName: text("artist_name").notNull(),
  type: text("type").notNull(),
  key: text("key"), // nullable — UG may carry no key
  capo: integer("capo").notNull(),
  tuning: text("tuning").notNull(),
  content: text("content").notNull(),
  urlWeb: text("url_web").notNull(),
});
export const _songUltimateGuitarExt = songUltimateGuitar.table; // drizzle-kit discovery
