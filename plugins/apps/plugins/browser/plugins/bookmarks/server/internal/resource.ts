import { asc } from "drizzle-orm";
import { z } from "zod";
import { db } from "@plugins/database/server";
import { defineResource } from "@plugins/framework/plugins/server-core/core";
import { BookmarkRowSchema, type BookmarkRow } from "../../shared/resources";
import { _browserBookmarks } from "./tables";

export const browserBookmarksServerResource = defineResource({
  key: "browser-bookmarks",
  mode: "push",
  schema: z.array(BookmarkRowSchema),
  loader: async (): Promise<BookmarkRow[]> => {
    const rows = await db
      .select()
      .from(_browserBookmarks)
      .orderBy(asc(_browserBookmarks.createdAt));
    return rows.map((r) => ({ id: r.id, url: r.url, title: r.title }));
  },
});
