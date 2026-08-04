import { HttpError } from "@plugins/infra/plugins/endpoints/server";
import {
  applyPageBlockPatch,
  serializePageContent,
} from "@plugins/page/plugins/editor/server";
import {
  parseMarkdownToForest,
  type Block,
  type BlockUpdate,
} from "@plugins/page/plugins/editor/core";
import { planMarkdownApply } from "../../core";
import { serverMarkdownContext } from "./markdown-context";
import { writeBlockText } from "./block-doc-text";

/**
 * Apply an edited markdown document onto an existing page — the write half of
 * `read_page` → edit → `write_page`.
 *
 * ---------------------------------------------------------------------------
 * Two channels, in this order, because they have two owners
 * ---------------------------------------------------------------------------
 *
 *  1. **Structure** — one `applyPageBlockPatch`, i.e. one locked transaction
 *     over the page's forest (which also fires `notifyStructuralChange`). It is
 *     atomic, and it is THE sanctioned forest write; there is no second route
 *     into `page_blocks`.
 *  2. **Text** — per surviving block, AFTER that commit. After, not before:
 *     `page_block_docs.block_id` is an FK onto `page_blocks.id`, so a created
 *     block has no row to hang a doc off until the patch lands, and a deleted
 *     block's doc has already FK-cascaded away by then. Within a block, the DOC
 *     is written before the ROW, because `page_blocks.data.text` is a
 *     PROJECTION of the doc — a row write is downstream of it, never the other
 *     way round.
 *
 * The row projections are then batched into ONE final patch. Every doc write
 * still precedes every row write, so the ordering above holds; batching only
 * collapses N transactions into one.
 *
 * **The projection is not optional.** `useTextProjection` is client-side and
 * needs a MOUNTED editor. Write a doc for a page nobody has open and `data.text`
 * would stay stale forever — and search, backlinks, version history and
 * `read-only-view` all read that column. The applier knows the exact new runs,
 * so it writes the same value a mounted client eventually would; a later client
 * flush is then an empty diff rather than a fight.
 *
 * ---------------------------------------------------------------------------
 * Failure: idempotence IS the recovery story
 * ---------------------------------------------------------------------------
 *
 * Step 1 is atomic. Step 2 is per-block and throws loudly naming the block,
 * which can leave structure applied and only some text written. That is
 * recoverable rather than corrupt because **the plan is a pure function of the
 * CURRENT stored state**: re-running the same apply converges — a block whose
 * text already landed matches on the way in and emits nothing, and
 * `writeBlockText` no-ops on a doc that already reads as the target runs.
 *
 * So there is deliberately no retry loop and no compensating rollback here.
 * Adding one would replace a loud, convergent partial state with a silent
 * attempt to guess which half of a two-owner write to undo.
 *
 * ---------------------------------------------------------------------------
 * Provenance: agent-origin does NOT apply, on purpose
 * ---------------------------------------------------------------------------
 *
 * `agentOriginCreateHook` reads the `x-singularity-origin` header off an HTTP
 * `Request` and marks whole PAGES an automated session created. A markdown
 * apply has no `Request` (it runs from an MCP tool), and it never creates a
 * page — it edits one that already exists. Both halves of that hook's
 * precondition are absent, so there is nothing to plumb. Do not "fix" this by
 * synthesizing a header: it would mark a human's page as agent-origin and hand
 * it to the 24h retention sweep.
 */

export interface ApplyReport {
  pageId: string;
  stats: { survived: number; created: number; deleted: number; moved: number };
  /** Block ids that kept their identity (and therefore their doc, star, links…). */
  survivingIds: string[];
  createdIds: string[];
  /** Survivors whose content doc this apply spliced. */
  textEditedIds: string[];
}

/** The `data` blob a text projection writes: the row's own, `text` replaced. */
function projectedData(row: Block, text: unknown): unknown {
  const base = row.data;
  return base !== null && typeof base === "object" && !Array.isArray(base)
    ? { ...(base as Record<string, unknown>), text }
    : { text };
}

export async function applyMarkdownToPage(
  pageId: string,
  markdown: string,
): Promise<ApplyReport> {
  const snapshot = await serializePageContent(pageId);
  if (!snapshot) {
    throw new HttpError(404, `page ${pageId} does not exist`);
  }

  const ctx = serverMarkdownContext();
  const incoming = parseMarkdownToForest(markdown, ctx);
  const result = planMarkdownApply({
    pageId,
    existing: snapshot.blocks,
    incoming,
    handles: ctx.handles,
  });
  // A refusal returns BEFORE any write: the planner cannot verify what it was
  // asked to do, and half-applying it would be worse than refusing it.
  if (!result.ok) {
    throw new HttpError(
      409,
      `markdown apply refused for page ${pageId} (${result.reason}): ${result.detail}`,
    );
  }
  const { patch, textEdits, stats } = result.plan;

  // --- 1. Structure, atomically --------------------------------------------
  const { blocks } = await applyPageBlockPatch(pageId, patch);
  const byId = new Map(blocks.map((b) => [b.id, b] as const));

  // --- 2a. Text: the doc, per block ----------------------------------------
  for (const edit of textEdits) {
    await writeBlockText(edit.blockId, edit.runs).catch((err: unknown) => {
      throw new Error(
        `markdown apply: could not write the content doc of block ${edit.blockId} ` +
          `on page ${pageId}. Structure is already committed; re-running the same ` +
          `apply converges (the plan is a pure function of current state).`,
        { cause: err },
      );
    });
  }

  // --- 2b. Text: the row projection, batched into one patch -----------------
  const updates: BlockUpdate[] = textEdits.map((edit) => {
    const row = byId.get(edit.blockId);
    if (!row) {
      // A survivor the patch above just wrote is gone: something deleted it
      // between the two statements. Loud rather than skipped — a re-run will
      // simply not name it, so this is self-healing but worth knowing about.
      throw new Error(
        `markdown apply: block ${edit.blockId} vanished between the structural ` +
          `commit and its text projection (concurrent delete on page ${pageId}).`,
      );
    }
    return { id: row.id, changes: { data: projectedData(row, edit.runs) } };
  });
  if (updates.length > 0) {
    await applyPageBlockPatch(pageId, { creates: [], updates, deleteIds: [] });
  }

  const createdIds = patch.creates.map((b) => b.id);
  const createdSet = new Set(createdIds);
  return {
    pageId,
    stats,
    survivingIds: blocks.filter((b) => !createdSet.has(b.id)).map((b) => b.id),
    createdIds,
    textEditedIds: textEdits.map((e) => e.blockId),
  };
}
