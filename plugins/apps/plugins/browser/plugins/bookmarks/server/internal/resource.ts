import { asc } from "drizzle-orm";
import { z } from "zod";
import { db } from "@plugins/database/server";
import { defineResource } from "@plugins/framework/plugins/server-core/core";
import { BookmarkRowSchema, type BookmarkRow } from "../../core/resources";
import { _browserBookmarks } from "./tables";

export const browserBookmarksServerResource = defineResource({
  key: "browser-bookmarks",
  mode: "push",
  schema: z.array(BookmarkRowSchema),
  // `_browserBookmarks.$inferSelect ≡ BookmarkRow` by construction (both derive
  // from `bookmarkFields`), so rows are returned verbatim — no projection.
  loader: async (): Promise<BookmarkRow[]> =>
    db.select().from(_browserBookmarks).orderBy(asc(_browserBookmarks.createdAt)),
});
