import { desc } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { serveValue } from "@plugins/network/plugins/live/server";
import { songs } from "../../core/resources";
import { _songs } from "./tables";

// `_songs.$inferSelect ≡ Song` by construction — both derive from the single
// `songFields` record (core) — so the loader returns `db.select()` rows verbatim
// (newest-first) with no projection and no `toSong` helper. Recomputed on every
// write to `sonata_songs`, which the loader's captured read-set routes here.
export const songsServed = serveValue(songs, {
  source: "db",
  unbounded: {
    reason:
      "the whole song library — whole-table only until Resources item 7: the library DataView sorts and filters every song client-side, including side-table field-extension columns (plays, tracks, file-missing), and a bounded window needs joined side-table sort/filter columns, the host rows in data-view's FieldExtensionProps, and live-window paging in DataView",
  },
  loader: async () => db.select().from(_songs).orderBy(desc(_songs.createdAt)),
});
