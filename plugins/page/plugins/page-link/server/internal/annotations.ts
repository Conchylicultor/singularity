import { and, eq, inArray } from "drizzle-orm";
import { db } from "@plugins/database/server";
import {
  liveBlocks,
  PAGE_BLOCK_TYPE,
  pageData,
} from "@plugins/page/plugins/editor/server";
import { pageLinkBlock } from "../../core";

/**
 * The `title` of the page each link-to-page block among `rows` points at — the
 * annotated `title` on `<page id="…" title="…"/>`, this plugin's
 * `Editor.BlockAnnotation` contribution.
 *
 * The title is the TARGET's, which is why it cannot come from the link's own
 * `data` and is read-only in the document (see `page-link-block.ts`).
 *
 * One query for every link in the read, and only the LIVE target pages: a link
 * to a page that was deleted (or trashed) gets no `title` at all rather than a
 * stale or empty one. The line still carries the id, which is the link's own
 * truth; an absent title is the document saying "nothing is there".
 */
export async function resolvePageLinkTitles(
  rows: readonly { id: string; type: string; data: unknown }[],
): Promise<ReadonlyMap<string, Record<string, string>>> {
  const byBlock = new Map<string, Record<string, string>>();
  const links: { id: string; pageId: string }[] = [];
  for (const row of rows) {
    if (row.type !== pageLinkBlock.type) continue;
    // The row came out of `page_blocks.data`, which the write boundary validated
    // against this very schema — a failure here is a corrupt row, and loud.
    const { pageId } = pageLinkBlock.parse(row.data);
    // An unfilled link (the block's empty state) points at nothing yet.
    if (pageId !== "") links.push({ id: row.id, pageId });
  }
  if (links.length === 0) return byBlock;

  const targets = await db
    .select({ id: liveBlocks.id, data: liveBlocks.data })
    .from(liveBlocks)
    .where(
      and(
        inArray(liveBlocks.id, [...new Set(links.map((l) => l.pageId))]),
        eq(liveBlocks.type, PAGE_BLOCK_TYPE),
      ),
    );
  const titleOf = new Map(targets.map((t) => [t.id, pageData(t).title]));
  for (const link of links) {
    const title = titleOf.get(link.pageId);
    if (title !== undefined) byBlock.set(link.id, { title });
  }
  return byBlock;
}
