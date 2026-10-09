import { defineIdKind, type IdOf } from "@plugins/ids/core";

/**
 * A browser bookmark (`browser_bookmarks.id`), declared once (`plugins/ids`).
 * Minted `bkmk-<epochSeconds>-<6>` by `addBookmark`. `legacyBareUuid`: rows
 * minted as bare uuids were prefixed (`bkmk-<uuid>`) by a data migration, and
 * `key` / `parse` upgrade a bare uuid arriving from a stale client.
 */
export const bookmarkIdKind = defineIdKind({
  prefix: "bkmk",
  label: "Bookmark",
  legacyBareUuid: true,
});

export type BookmarkId = IdOf<typeof bookmarkIdKind>;
