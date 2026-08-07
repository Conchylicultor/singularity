import { HttpError } from "@plugins/infra/plugins/endpoints/server";
import {
  applyPageBlockPatch,
  serializePageContent,
  type StoredBlock,
} from "@plugins/page/plugins/editor/server";
import {
  parseMarkdownToForest,
  type Block,
  type BlockUpdate,
} from "@plugins/page/plugins/editor/core";
import {
  documentOrderRows,
  pageTitleBanner,
  planMarkdownApply,
  stripPageTitleBanner,
  type MarkdownApplyPlan,
} from "../../core";
import { serverMarkdownContext } from "./markdown-context";
import { loadBlockScope } from "./read";
import { writeBlockText } from "./block-doc-text";

/**
 * Apply an edited markdown document onto an existing block's subtree — the write
 * half of read → edit → write.
 *
 * ---------------------------------------------------------------------------
 * The root is the scope; the page is the transaction
 * ---------------------------------------------------------------------------
 *
 * The plan is bounded by its ROOT (see `core/plan.ts`), so a scoped apply can
 * only rewrite the addressed block's subtree. The WRITE is still a whole-page
 * one: `applyPageBlockPatch` locks the page's entire forest either way, because
 * `(parent_id, rank)` is one ordering space and a partial lock would not make a
 * partial write safe. Narrowing the lock to the subtree would buy concurrency
 * this has no need for and lose the atomicity it depends on.
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

export interface ApplyBlockOptions {
  /**
   * The row filter that produced the document being applied — the SAME function
   * the read was given (`ReadBlockOptions.redact`), which is why both options
   * take the same shape: a caller passes ONE function to both halves, and a read
   * and the apply that answers it cannot drift into diffing against a document
   * nobody ever saw.
   *
   * It prunes the planner's WALK only. The whole partition is still loaded and
   * still handed to the planner, so a hidden row keeps its `(parent_id, rank)`
   * key reserved and stays distinguishable from an id that names nothing —
   * see `core/plan.ts`'s `redact`.
   */
  redact?: (rows: StoredBlock[]) => readonly StoredBlock[];
  /**
   * Judge the plan BEFORE a row is written. **Throwing refuses the whole apply**,
   * and is the only way to refuse one: there is no return value, because a
   * boolean would need this module to invent the wording and the status of a
   * refusal it cannot describe.
   *
   * The engine's second caller-supplied predicate, and the exact DUAL of
   * {@link redact}: `redact` decides what a write may SEE, this decides what it
   * may DO. Both keep the engine audience-agnostic — one takes rows and returns
   * rows, the other takes a plan and either returns or throws, and neither
   * teaches this plugin what a policy is. `core/touched.ts` is the vocabulary a
   * caller normally judges with (`touchedBlocks`, `boundaryViolations`), and it
   * names no block type either.
   *
   * Called **exactly once, synchronously**, after planning and strictly before
   * the first `applyPageBlockPatch` — so a refusal has provably written nothing,
   * exactly like the planner's own refusals above it. `rows` is the same
   * whole-partition, UNREDACTED row set the plan was built over, which is what a
   * chain walk needs: an ancestor may be a row the document never showed.
   *
   * There is deliberately no exported `plan`/`commit` pair doing the same job
   * from outside. A caller holding a plan could commit it against rows it re-read
   * — a different forest from the one the plan diffs — and no type can express
   * "these two came from the same read". Keeping the hook inside the one function
   * that owns both halves makes that unreachable rather than merely discouraged.
   */
  assertAcceptable?(plan: MarkdownApplyPlan, rows: readonly StoredBlock[]): void;
}

export interface ApplyReport {
  /** The block this apply was rooted at — the page row for a whole-page apply. */
  rootId: string;
  /** The page whose forest was locked and written. */
  pageId: string;
  stats: { survived: number; created: number; deleted: number; moved: number };
  /**
   * Block ids that kept their identity (and therefore their doc, star, links…).
   * Scoped to the root's subtree, like every other authority in this apply: a
   * row outside it was never a candidate for anything, and reporting it as a
   * "survivor" would claim the apply had considered it.
   */
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

/** One scoped apply: the two channels, over rows a caller has already read. */
async function applyToScope(scope: {
  rootId: string;
  pageId: string;
  /** The page's STORED title — the banner this apply may have to strip. */
  title: string;
  rows: readonly StoredBlock[];
  markdown: string;
  redact?: ApplyBlockOptions["redact"];
  assertAcceptable?: ApplyBlockOptions["assertAcceptable"];
}): Promise<ApplyReport> {
  const { rootId, pageId, title, rows, markdown, redact, assertAcceptable } = scope;
  const ctx = serverMarkdownContext();
  // The banner comes off BEFORE the parse and only for a page ROOT — the exact
  // mirror of where `readBlockAsMarkdown` puts it on, so what a read emitted is
  // what an apply takes back. Built from the STORED title, never from anything
  // in the incoming document: the test is "is this line still the one this
  // page's own read produced", and a document cannot answer that about itself.
  // Anything that fails the test falls through to the planner and is judged
  // there — see `core/page-title.ts` for the four arms and why they are right.
  const document =
    rootId === pageId
      ? stripPageTitleBanner(markdown, pageTitleBanner(title, ctx))
      : markdown;
  const incoming = parseMarkdownToForest(document, ctx);
  const result = planMarkdownApply({
    rootId,
    pageId,
    // The WHOLE partition, redacted or not: the filter below prunes the planner's
    // walk, which is the entire mechanism — see `core/plan.ts`.
    existing: rows,
    incoming,
    handles: ctx.handles,
    redact,
  });
  // A refusal returns BEFORE any write: the planner cannot verify what it was
  // asked to do, and half-applying it would be worse than refusing it.
  if (!result.ok) {
    throw new HttpError(
      409,
      `markdown apply refused for block ${rootId} on page ${pageId} ` +
        `(${result.reason}): ${result.detail}`,
    );
  }
  // The caller's own verdict on the plan, between "what would this write" and
  // "write it". It is handed the UNREDACTED rows the plan was built over, since
  // a policy reasoning about ancestry needs rows the document never showed.
  // Throwing here refuses the whole apply with nothing written — the same
  // guarantee the planner's refusal above has, and the reason this cannot be a
  // check the caller performs afterwards.
  assertAcceptable?.(result.plan, rows);

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
  // The SAME walk the plan was built over, re-run on the post-patch rows — so
  // "survived" means "still in the scope this apply had authority over", and a
  // preserved sub-page shell re-homed above the rank floor is counted where it
  // now sits rather than where it used to. `Block.rank` is a `Rank` value object
  // where the engine reads the RAW stored string, which is the one projection
  // `serializePageContent` also makes on the way in.
  const inScope = documentOrderRows(
    blocks.map((b) => ({
      id: b.id,
      parentId: b.parentId,
      type: b.type,
      data: b.data,
      rank: b.rank.toJSON(),
      expanded: b.expanded,
    })),
    rootId,
  );
  return {
    rootId,
    pageId,
    stats,
    survivingIds: inScope.filter((b) => !createdSet.has(b.id)).map((b) => b.id),
    createdIds,
    textEditedIds: textEdits.map((e) => e.blockId),
  };
}

/**
 * Apply an edited markdown document onto one block's subtree. Nothing outside
 * that subtree — and not the block itself — can be written, whatever the
 * document says.
 */
export async function applyMarkdownToBlock(
  blockId: string,
  markdown: string,
  opts?: ApplyBlockOptions,
): Promise<ApplyReport> {
  const { pageId, title, rows } = await loadBlockScope(blockId);
  return applyToScope({
    rootId: blockId,
    pageId,
    title,
    rows,
    markdown,
    redact: opts?.redact,
    assertAcceptable: opts?.assertAcceptable,
  });
}

/**
 * Apply an edited markdown document onto a whole page — {@link
 * applyMarkdownToBlock} rooted at the page row.
 *
 * Its own entry point for the same reason `readPageAsMarkdown` is: the snapshot
 * coming back IS the proof that `pageId` names a live PAGE row, so a caller that
 * means "this page" cannot silently rewrite the page around a content block.
 */
export async function applyMarkdownToPage(
  pageId: string,
  markdown: string,
  opts?: ApplyBlockOptions,
): Promise<ApplyReport> {
  const snapshot = await serializePageContent(pageId);
  if (!snapshot) {
    throw new HttpError(404, `page ${pageId} does not exist`);
  }
  return applyToScope({
    rootId: pageId,
    pageId,
    title: snapshot.page.title,
    rows: snapshot.blocks,
    markdown,
    redact: opts?.redact,
    assertAcceptable: opts?.assertAcceptable,
  });
}
