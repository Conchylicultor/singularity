import { and, eq, isNull } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { HttpError } from "@plugins/infra/plugins/endpoints/server";
import {
  PAGE_BLOCK_TYPE,
  _blocks,
  resolveBlockAnnotations,
  serializePageContent,
  type StoredBlock,
} from "@plugins/page/plugins/editor/server";
import { serializeForestToMarkdown } from "@plugins/page/plugins/editor/core";
import { markdownNodesOfRows, pageTitleBanner } from "../../core";
import { serverMarkdownContext } from "./markdown-context";

/** The page a block lives in, plus every live row of that page's partition. */
export interface BlockScope {
  /** The `page_id` partition `rows` came from — the page any created row joins. */
  pageId: string;
  /**
   * That page's stored title — the banner a page-rooted read prepends and a
   * page-rooted apply strips (`core/page-title.ts`).
   *
   * It rides on the scope because this is the ONE place it is available without
   * a second query: a page's own row is NOT in its content partition (`rows` is
   * the page's children and below), so nothing downstream of the walk can see
   * it. `serializePageContent` already returns it on `page: PageData` and this
   * function used to throw that half away.
   */
  title: string;
  /** Every LIVE row of that partition (sub-page shells included). */
  rows: StoredBlock[];
}

/**
 * Resolve `blockId` to the page that owns it, and load that page's rows — the
 * read both entry points of this plugin begin with.
 *
 * The owning page is read off the denormalized `page_blocks.page_id` column,
 * which is the only chokepoint available *here*: `serializePageContent` and the
 * rows it returns both need the page id already, and `getBlockPage` is an HTTP
 * endpoint contract, not a callable function. The one rule that has to be
 * mirrored from that endpoint's handler is that **a page row answers with
 * itself** — a page's own `page_id` names the page it is DISPLAYED in, i.e. its
 * parent — which is what keeps `readBlockAsMarkdown(pageId)` a whole-page read.
 */
export async function loadBlockScope(blockId: string): Promise<BlockScope> {
  const [row] = await db
    .select({ id: _blocks.id, type: _blocks.type, pageId: _blocks.pageId })
    .from(_blocks)
    // Trashed rows are `deletedAt`-flagged, not deleted. A trashed block is not
    // addressable: its subtree is not in the page's live forest, so scoping to
    // it would silently read and write an empty document.
    .where(and(eq(_blocks.id, blockId), isNull(_blocks.deletedAt)))
    .limit(1);

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard, no noUncheckedIndexedAccess
  if (!row) throw new HttpError(404, `block ${blockId} does not exist`);
  const pageId = row.type === PAGE_BLOCK_TYPE ? row.id : row.pageId;
  if (pageId === null) {
    throw new HttpError(
      404,
      `block ${blockId} sits at the forest root and is displayed by no page`,
    );
  }

  const snapshot = await serializePageContent(pageId);
  if (!snapshot) throw new HttpError(404, `page ${pageId} does not exist`);
  // A content block is in its own page's partition by construction — the query
  // that loaded these rows is keyed on the very column that named `pageId`.
  // Asserted anyway, and loudly: the failure mode of a root that is not in the
  // forest is a walk that reaches nothing, i.e. an EMPTY document, which reads
  // as "this block has no content" and would be written back as a full delete.
  if (blockId !== pageId && !snapshot.blocks.some((b) => b.id === blockId)) {
    throw new HttpError(404, `block ${blockId} is not part of page ${pageId}`);
  }
  return { pageId, title: snapshot.page.title, rows: snapshot.blocks };
}

/**
 * Serialize the subtree rooted at `rootId` out of one page's rows.
 *
 * `markdownNodesOfRows` stamps each row's id onto its node, which is what makes
 * `<page id="…"/>` a POINTER a later apply can reconcile against the existing
 * shell rather than a tag it has to re-mint. It is also the same walk the
 * planner flattens the stored side with — the two must not diverge, or the
 * apply would be a diff against a document nobody ever saw.
 *
 * The annotations — the values of a tag's `markdown.tag.annotated` attributes,
 * which live outside the block's `data` — are resolved against the ROWS THIS
 * FUNCTION WAS HANDED, i.e. after any `redact` the caller applied. That is the
 * whole reason the resolve happens here rather than at either entry point: a
 * hidden card is not in `rows`, so it costs no provider query and its linked
 * task can never surface in a document that does not show the card itself.
 *
 * Those rows are the (redacted) whole page partition, which for a block-rooted
 * read is a superset of the subtree the walk emits. A superset costs only work;
 * a subset would silently drop an annotation from a node the walk does reach.
 */
async function serializeRoot(
  rows: readonly StoredBlock[],
  rootId: string,
): Promise<string> {
  const annotations = await resolveBlockAnnotations(rows);
  return serializeForestToMarkdown(
    markdownNodesOfRows(rows, rootId, annotations),
    serverMarkdownContext(),
  );
}

/**
 * The document a PAGE-rooted read returns: the banner, then the page's content.
 *
 * A page's own row has no line in its document (the walk starts at the root's
 * children), so without this a read of a page opens at its first block and the
 * page's title — the thing every other reader of a page sees first — is simply
 * absent. The banner is a reader-side prefix, not a node: it is prepended to the
 * finished string, and `stripPageTitleBanner` takes it back off before an apply
 * parses one. See `core/page-title.ts` for why both halves live in one module.
 */
function withTitleBanner(markdown: string, title: string): string {
  return pageTitleBanner(title, serverMarkdownContext()) + markdown;
}

export interface ReadBlockOptions {
  /**
   * A row filter applied to the page's rows BEFORE the walk. Pruning a row
   * therefore prunes its whole subtree — the walk simply never reaches a child
   * whose parent is gone — which is what makes "hide this card" mean "hide this
   * card and everything in it" without the filter having to say so.
   *
   * The engine never learns what a redaction IS: this is a row filter, and
   * whatever policy chose it lives with the caller.
   */
  redact?: (rows: StoredBlock[]) => StoredBlock[];
}

/**
 * A block's CONTENT as the markdown an agent edits — the subtree below it, with
 * the block itself as the scope rather than a line in the document.
 *
 * The block id is resolved to its page (see {@link loadBlockScope}), so a page
 * id and a block id are the same call at different depths.
 *
 * The `# Title` banner is the ONE thing those two depths do not share, and the
 * condition is exactly `blockId === pageId`: a page's title belongs to the
 * document its own read returns, and to no other. A card-scoped read must not
 * carry one — the string it returns is that card's content, so a banner there
 * would come back through `applyMarkdownToBlock(card, …)` as an `# H1` minted
 * INSIDE the card, which nobody asked for and nothing else would have caught.
 */
export async function readBlockAsMarkdown(
  blockId: string,
  opts?: ReadBlockOptions,
): Promise<string> {
  const { pageId, title, rows } = await loadBlockScope(blockId);
  const markdown = await serializeRoot(opts?.redact ? opts.redact(rows) : rows, blockId);
  return blockId === pageId ? withTitleBanner(markdown, title) : markdown;
}

/**
 * A whole page as markdown — {@link readBlockAsMarkdown} rooted at the page row.
 *
 * Kept as its own entry point because the page id is ASSERTED here rather than
 * resolved: `serializePageContent` returning a snapshot IS the proof that the id
 * names a live PAGE row, so a caller that means "this page" still 404s on a
 * content block's id instead of silently reading the page around it.
 */
export async function readPageAsMarkdown(pageId: string): Promise<string> {
  const snapshot = await serializePageContent(pageId);
  if (!snapshot) {
    throw new HttpError(404, `page ${pageId} does not exist`);
  }
  // Unconditionally banner-ed, where {@link readBlockAsMarkdown} tests its id:
  // this entry point has already ASSERTED that the root is a page.
  return withTitleBanner(
    await serializeRoot(snapshot.blocks, pageId),
    snapshot.page.title,
  );
}
