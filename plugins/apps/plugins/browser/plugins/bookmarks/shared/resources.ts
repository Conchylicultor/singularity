import { z } from "zod";
import { resourceDescriptor } from "@plugins/primitives/plugins/live-state/core";

// One row per bookmark, ordered by createdAt asc.
export const BookmarkRowSchema = z.object({
  id: z.string(),
  url: z.string(),
  title: z.string(),
});
export type BookmarkRow = z.infer<typeof BookmarkRowSchema>;

export const browserBookmarksResource = resourceDescriptor<BookmarkRow[]>(
  "browser-bookmarks",
  z.array(BookmarkRowSchema),
  [],
);
