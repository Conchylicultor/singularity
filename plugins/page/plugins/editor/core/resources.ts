import { z } from "zod";
import { liveValue } from "@plugins/network/plugins/live/core";
import { resourceDescriptor } from "@plugins/primitives/plugins/live-state/core";
import { BlockSchema, PageRowSchema } from "./schemas";
import type { PageRow } from "./schemas";

// All pages (`type="page"` blocks). The sidebar tree is built from these by
// `pageId` (the nearest page ancestor — `parentId` may point at a content
// block), and ordered by `docRank` — the loader's derived document-order key
// (see `PageRowSchema`), NOT the raw storage `rank`. Array order ≡ `docRank`
// order.
export const pagesResource = resourceDescriptor<PageRow[]>(
  "pages",
  z.array(PageRowSchema),
  [],
);

// A page's content forest: every block whose nearest page ancestor is
// `pageId`, sub-page rows included, pushed whole whenever it changes. A value
// rather than a collection: the editor's reducer, its optimistic overlay and
// document order all need EVERY block of the page (a window would truncate the
// document), and its loader reads through the `liveBlocks` subquery rather than
// one table's rows. Not known yet is `pending` — there is no `[]` placeholder.
export const pageBlocks = liveValue("page-blocks", {
  schema: z.array(BlockSchema),
  params: ["pageId"],
});

// When the page was last edited: the newest `updatedAt` across the page row AND
// every live block of its content.
// The page row alone would not do: a content edit stamps only the edited
// block's own row (`page_blocks.updated_at` is per row), never the page row.
// `null` when no such live page exists. A scalar per page, recomputed by the
// change feed on any write to the page's blocks.
export const pageEditedAt = liveValue("page-edited-at", {
  schema: z.object({ editedAt: z.coerce.date() }).nullable(),
  params: ["pageId"],
});
