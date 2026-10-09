import { sql } from "drizzle-orm";
import { z } from "zod";
import { db, type DbExecutor } from "@plugins/database/server";
import { executeRows } from "@plugins/database/plugins/sql-rows/core";
import {
  PAGE_BLOCK_TYPE,
  readPageEditedAt,
} from "@plugins/page/plugins/editor/server";
import { loadBacklinkSources } from "@plugins/page/plugins/links/server";
import type { PageMeta } from "../../core";

const ChainRowSchema = z.object({
  id: z.string(),
  title: z.string().nullable(),
  created_at: z.coerce.date(),
  depth: z.number(),
});

/**
 * The facts a `<page-meta>` header states about `pageId` (`core/page-meta.ts`):
 * its ancestry, root first and ending with the page itself, and its created and
 * edited times, and the pages linking to it.
 *
 * The chain walks `page_blocks.page_id` upward — a page row's `page_id` is the
 * page it is DISPLAYED in, i.e. its parent page — the server twin of the Pages
 * app's breadcrumb (`page-tree/web/ancestors.ts`). Live rows only: a page whose
 * parent is trashed is not reachable by any read, so the walk never meets one.
 *
 * `edited` is the editor's own `readPageEditedAt`, the value behind the page's
 * "Edited" label, so the header and the UI cannot state two different times.
 * `backlinks` is the backlinks index's own read (`page/links`), the same edges
 * the page's Backlinks panel lists.
 */
export async function loadPageMeta(
  pageId: string,
  executor: DbExecutor = db,
): Promise<PageMeta> {
  const rows = await executeRows(executor, {
    label: "markdown-apply.page-meta",
    row: ChainRowSchema,
    query: sql`
      WITH RECURSIVE chain AS (
        SELECT b.id, b.page_id, b.data->>'title' AS title, b.created_at, 0 AS depth
        FROM page_blocks b
        WHERE b.id = ${pageId} AND b.type = ${PAGE_BLOCK_TYPE} AND b.deleted_at IS NULL
        UNION ALL
        SELECT p.id, p.page_id, p.data->>'title', p.created_at, c.depth + 1
        FROM page_blocks p
        JOIN chain c ON p.id = c.page_id
        WHERE p.deleted_at IS NULL AND c.depth < 10000
      )
      SELECT id, title, created_at, depth FROM chain ORDER BY depth DESC
    `,
  });
  const self = rows.at(-1);
  if (self === undefined || self.id !== pageId) {
    throw new Error(`page-meta: ${pageId} is not a live page`);
  }
  const edited = await readPageEditedAt(pageId, executor);
  if (edited === null) {
    throw new Error(`page-meta: ${pageId} has no edit time`);
  }
  return {
    created: self.created_at,
    edited: edited.editedAt,
    breadcrumb: rows.map((r) => ({ id: r.id, title: r.title ?? "" })),
    backlinks: await loadBacklinkSources(pageId, executor),
  };
}
