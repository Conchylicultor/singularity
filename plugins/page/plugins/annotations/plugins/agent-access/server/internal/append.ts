import { HttpError } from "@plugins/infra/plugins/endpoints/server";
import { Rank } from "@plugins/primitives/plugins/rank/core";
import { applyPageBlockPatch, type StoredBlock } from "@plugins/page/plugins/editor/server";
import {
  parseMarkdownToForest,
  planForestInsert,
  withMintedIds,
  type Block,
  type SerializedBlock,
} from "@plugins/page/plugins/editor/core";
import {
  loadBlockScope,
  serverMarkdownContext,
} from "@plugins/page/plugins/markdown-apply/server";
import { agentNotesBlock } from "@plugins/page/plugins/annotations/plugins/agent-notes/core";
import { assertAppendTarget, assertForestWritable } from "./policy";

/**
 * Mint one new `<agent-notes>` card under `blockId`, holding the parsed markdown
 * as its children.
 *
 * ---------------------------------------------------------------------------
 * Why this does NOT go through the markdown applier
 * ---------------------------------------------------------------------------
 *
 * An append expressed as a diff would be "read the subtree, concatenate, write
 * it back" — and that write carries authority over every row the read returned.
 * Nothing but a guard would then stand between "add a note" and "delete the
 * page". Building the patch directly makes it **creates-only**: `updates` and
 * `deleteIds` are empty literals, so the write is structurally incapable of
 * touching anything that already exists. There is no invariant here to get
 * wrong, which is why this path is the one an agent reaches by default.
 *
 * The engine is still the parser: `parseMarkdownToForest` under the SAME
 * `serverMarkdownContext()` the read and the applier use, so what an agent
 * writes and what it reads back are one dialect.
 */
export interface AppendResult {
  /** The page whose forest was written. */
  pageId: string;
  /** The new card's block id — the handle for every later write to it. */
  noteId: string;
  /** Every row this created: the card plus its parsed children. */
  createdIds: string[];
}

/** The highest rank among `parentId`'s live children, or `null` if it has none. */
function lastChildRank(rows: readonly StoredBlock[], parentId: string): Rank | null {
  let max: Rank | null = null;
  for (const row of rows) {
    if (row.parentId !== parentId) continue;
    const rank = Rank.from(row.rank);
    if (max === null || Rank.compare(rank, max) > 0) max = rank;
  }
  return max;
}

export async function appendAgentNotes(
  blockId: string,
  markdown: string,
): Promise<AppendResult> {
  const scope = await loadBlockScope(blockId);
  assertAppendTarget(scope, blockId);

  const ctx = serverMarkdownContext();
  const children = parseMarkdownToForest(markdown, ctx);
  if (children.length === 0) {
    // An empty card is not a degenerate success: it would be an invisible
    // dashed box the author has to delete by hand, and the caller almost
    // certainly meant to send content.
    throw new HttpError(
      400,
      `append_agent_notes: the markdown parsed to no blocks, so there is nothing ` +
        `to append to block ${blockId}.`,
    );
  }
  assertForestWritable(children);

  // The card is `data: {}` by its own handle's account — a void container owns
  // nothing but its type — rather than by a literal written here.
  const card: SerializedBlock = {
    type: agentNotesBlock.type,
    data: agentNotesBlock.empty?.() ?? {},
    expanded: true,
    children,
  };
  // `withMintedIds` is the one id-minting site; ids ride ON the node, so the
  // card's own id is readable here without a second traversal to find it.
  const identified = withMintedIds([card])[0]!;

  // Rank strictly after everything already under `blockId`. The floor matters
  // for the same reason `replacePageContent` states it: `(parent_id, rank)` is a
  // live UNIQUE index, so an interval that is not provably free of an existing
  // sibling's key is a constraint violation. Two concurrent appends computing
  // from the same floor would collide there — loudly, at the DB, which is the
  // right failure for a race this tool has no reason to smooth over.
  const rootRanks = Rank.nBetween(lastChildRank(scope.rows, blockId), null, 1);
  const { nodes } = planForestInsert({
    pageId: scope.pageId,
    parentId: blockId,
    rootRanks,
    forest: [identified],
  });

  const now = new Date();
  // Text for a CREATED block rides `data.text`, which is legal and required: a
  // brand-new id has no content doc, so the row is the doc's only seed and a
  // mounted client seeds from it on first render.
  const creates: Block[] = nodes.map((node) => ({
    ...node,
    rank: Rank.from(node.rank),
    createdAt: now,
    updatedAt: now,
  }));
  await applyPageBlockPatch(scope.pageId, { creates, updates: [], deleteIds: [] });

  return {
    pageId: scope.pageId,
    noteId: identified.id,
    createdIds: nodes.map((node) => node.id),
  };
}
