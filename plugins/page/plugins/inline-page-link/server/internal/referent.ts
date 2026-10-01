import { and, eq } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { PAGE_BLOCK_TYPE, pageData } from "@plugins/page/plugins/editor/core";
import { liveBlocks } from "@plugins/page/plugins/editor/server";
import type { InlineTokenReferent } from "@plugins/primitives/plugins/text-editor/plugins/inline-chip/server";
import { scanPageLinkTokens } from "../../core";

/** A page with no title of its own still has to be called something. */
const UNTITLED = "Untitled";

/**
 * A `[[page:<id>]]` token's name — what its inline chip shows: the linked
 * page's title. A trashed page, or an id that is not a page, is not found (the
 * token then stays as written).
 */
export async function resolvePageLinkReferent(
  token: string,
): Promise<InlineTokenReferent> {
  const [pageId] = scanPageLinkTokens(token);
  if (pageId === undefined) return { found: false };
  const [row] = await db
    .select({ data: liveBlocks.data })
    .from(liveBlocks)
    .where(and(eq(liveBlocks.id, pageId), eq(liveBlocks.type, PAGE_BLOCK_TYPE)))
    .limit(1);
  if (!row) return { found: false };
  return { found: true, title: pageData(row).title || UNTITLED };
}
