import { z } from "zod";
import { resourceDescriptor } from "@plugins/primitives/plugins/live-state/core";
import {
  fieldsToZodObject,
  type FieldsRecord,
} from "@plugins/fields/core";
import { textField } from "@plugins/fields/plugins/text/plugins/config/core";
import { dateField } from "@plugins/fields/plugins/date/plugins/config/core";

// One row per bookmark, ordered by createdAt asc. The `browser_bookmarks` table
// and this wire schema both derive from `bookmarkFields` (via defineEntity on
// the server), so a column/schema drift is unrepresentable and the loader
// returns `db.select()` rows verbatim. `createdAt` is a coerced Date on the wire.
export const bookmarkFields = {
  id:        textField(),
  url:       textField(),
  title:     textField(),
  createdAt: dateField(),
} satisfies FieldsRecord;

export const BookmarkRowSchema = fieldsToZodObject(bookmarkFields);
export type BookmarkRow = z.infer<typeof BookmarkRowSchema>;

export const browserBookmarksResource = resourceDescriptor<BookmarkRow[]>(
  "browser-bookmarks",
  z.array(BookmarkRowSchema),
  [],
);
