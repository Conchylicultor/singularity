import { eq } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { PAGE_BLOCK_TYPE, pageData } from "@plugins/page/plugins/editor/core";
import { liveBlocks } from "@plugins/page/plugins/editor/server";
import type { InlineTokenReferent } from "@plugins/primitives/plugins/text-editor/plugins/inline-chip/server";

/** A page with no title of its own still has to be called something. */
const UNTITLED = "Untitled";

async function readBlock(id: string) {
  const [row] = await db
    .select({
      type: liveBlocks.type,
      pageId: liveBlocks.pageId,
      data: liveBlocks.data,
    })
    .from(liveBlocks)
    .where(eq(liveBlocks.id, id))
    .limit(1);
  return row;
}

/**
 * A `block-<id>` token's name, for text a model reads — what the chip shows: a
 * page's title, or for a content block "<page title> › <block type>". A trashed
 * block, or one no page displays, is not found.
 */
export async function resolveBlockReferent(
  id: string,
): Promise<InlineTokenReferent> {
  const row = await readBlock(id);
  if (!row) return { found: false };
  if (row.type === PAGE_BLOCK_TYPE) {
    return { found: true, title: pageData(row).title || UNTITLED };
  }
  if (row.pageId === null) return { found: false };
  const page = await readBlock(row.pageId);
  if (!page) return { found: false };
  return {
    found: true,
    title: `${pageData(page).title || UNTITLED} › ${row.type}`,
  };
}
