import { db } from "@plugins/database/server";
import { implement } from "@plugins/infra/plugins/endpoints/server";
import { setPageAuthor } from "../../core/endpoints";
import { blockAuthorOf, type BlockAuthor } from "../../core/define-block";
import { pageBlockHandle, type Block } from "../../core/schemas";
import type { ForestExecutor } from "./page-forest";
import { rewritePageRow } from "./page-row-write";
import { reauthorPageData } from "./parse-block-data";

/**
 * Make a page agent-authored, or an ordinary page again — the page header's
 * toggle, and the ONLY write that changes a page's author after it is born
 * (`research/2026-09-15-page-agent-page-follow-ups.md` §1).
 *
 * Any page may be flipped, a top-level one included: it is the human's choice,
 * and no MCP tool exposes this op, so only the human makes it. The write is
 * {@link reauthorPageData}'s — the stored data with the author set and every
 * other key copied — so a flip cannot carry a title or an icon along with it.
 *
 * Setting the author the page already has is a no-op: no write, no event, the
 * row returned as it is. So a double click, or two tabs clicking at once, lands
 * one flip, not a flip and a flip back.
 *
 * What a flip leaves alone: the page's content, its authorship rows (which
 * conversations wrote into it — they stop showing while the page is a human's,
 * and show again if it is flipped back), and every version in its history (a
 * restore keeps the page's CURRENT author; see `restorePageContent`).
 *
 * Exported beside the endpoint so a DB-backed suite drives it on a throwaway
 * database, as `applyPageBlockPatch` is.
 */
export async function setPageAuthorOf(
  pageId: string,
  author: BlockAuthor,
  executor: ForestExecutor = db,
): Promise<Block> {
  return rewritePageRow(
    pageId,
    (row) =>
      (blockAuthorOf(pageBlockHandle, row.data) ?? "human") === author
        ? null
        : reauthorPageData({ before: row, author }),
    executor,
  );
}

/** The HTTP face of {@link setPageAuthorOf} — validation and nothing else. */
export const handleSetPageAuthor = implement(
  setPageAuthor,
  ({ params, body }) => setPageAuthorOf(params.id, body.author),
);
