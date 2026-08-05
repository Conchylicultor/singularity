// The PURE matching engine behind "apply this edited markdown onto that page".
//
// It answers one question — which stored block is which incoming node — and
// turns the answer into the smallest `BlockPatch` that realizes it, plus the
// text changes that must NOT ride that patch. No DB, no React, no I/O.
//
// ---------------------------------------------------------------------------
// The two invariants a survivor's update may never break
// ---------------------------------------------------------------------------
//
//  1. **A survivor's update never names `text`.** A block's text has exactly one
//     owner, its per-block `Y.Doc`; `page_blocks.data.text` is a debounced
//     PROJECTION of it. So a changed text leaves through `textEdits`, and the
//     `data` a survivor's update carries always restates the block's CURRENT
//     projection verbatim — the same thing `preserveText` does when the editor
//     converts a block's type. Writing the incoming text into the row instead
//     would make the row authoritative over the doc for as long as it took the
//     next projection flush to disagree.
//  2. **A survivor's update never names `expanded`.** A parsed forest is
//     uniformly `expanded: true` (a self-closing tag cannot distinguish
//     "collapsed" from "childless", and blocks are born expanded), so writing it
//     would silently unfold every collapsed toggle, callout and sub-page on the
//     page on every apply. Newly created rows carry the incoming node's own
//     `expanded`, which for a parsed forest is that same uniform `true`.
//
// Both are properties of the emitted patch, not of a downstream filter, and
// `plan.test.ts` asserts them directly over fuzzed edits.
//
// ---------------------------------------------------------------------------
// Scope: the root bounds every authority the plan claims
// ---------------------------------------------------------------------------
//
// `rootId` is where the walk starts, and it is the ONLY thing bounding what this
// plan may touch. `existing` is deliberately the page's whole `page_id`
// partition (a rank floor and a sub-page pin both need rows the walk may not
// reach), but `oldRows` — the walk's output — is what survivors, updates and
// `deleteIds` are all derived from, so a row outside the root's subtree can
// never be updated, moved or deleted however the document was edited.
//
// `pageId` is a SECOND, independent fact: which partition created rows join, and
// whether the root is the page itself. It is required rather than inferred
// because a nested root cannot tell you its page — and because the two differing
// is exactly what turns an absent sub-page shell from a re-home into a refusal.
//
// ---------------------------------------------------------------------------
// Idempotence is the recovery story
// ---------------------------------------------------------------------------
//
// The plan is a pure function of the CURRENT stored state. Re-running an apply
// therefore converges: whatever already landed matches and emits nothing. That
// is what makes the two-channel write (structure atomically, then text per
// block) recoverable rather than corrupt if it fails half-way — and why nothing
// here may depend on having seen the previous attempt.

import {
  PAGE_BLOCK_TYPE,
  coalesce,
  dataEqual,
  markdownParseTagName,
  pageBlockMarkdown,
  runsOf,
  serializeForestToMarkdown,
  withMintedIds,
  type Block,
  type BlockFieldChanges,
  type BlockHandle,
  type BlockPatch,
  type BlockUpdate,
  type IdentifiedBlock,
  type MarkdownContext,
  type RichText,
  type SerializedBlock,
} from "@plugins/page/plugins/editor/core";
import { Rank } from "@plugins/primitives/plugins/rank/core";
import { alignItems, type AlignItem } from "./align";
import {
  documentOrderRows,
  identityKeyOf,
  pinnedShellKey,
  plainTextOf,
  stableJson,
} from "./flatten";
import { maxRank, planSiblingRanks } from "./ranks";
import type { StoredRow } from "./stored-row";

/** One surviving block's new text, to be spliced into its content doc. */
export interface MarkdownTextEdit {
  blockId: string;
  runs: RichText;
}

export interface MarkdownApplyPlan {
  patch: BlockPatch;
  textEdits: MarkdownTextEdit[];
  stats: { survived: number; created: number; deleted: number; moved: number };
}

/**
 * Discriminated, per the repo's absorbable-failure rule: an EMPTY patch means
 * "nothing to do", and must never be confusable with "something went wrong".
 */
export type MarkdownApplyResult =
  | { ok: true; plan: MarkdownApplyPlan }
  | {
      ok: false;
      reason: "unknown-page-ref" | "subpage-reparented" | "subpage-removed";
      detail: string;
    };

export interface MarkdownApplyArgs {
  /**
   * The root of the SCOPE. The walk starts at its CHILDREN, so the root row
   * itself is never touched and nothing outside its subtree is ever updated,
   * moved or deleted. The page row for a whole-page apply; any block within the
   * page for a scoped one.
   */
  rootId: string;
  /**
   * The page `existing` was read from — the partition every created row joins.
   * Separate from {@link rootId} rather than inferred from it: a nested root
   * cannot name its own page, and `rootId !== pageId` is what makes an absent
   * sub-page shell a refusal rather than a re-home to the top level.
   */
  pageId: string;
  /** Every LIVE row of the page's own `page_id` partition (sub-page shells included). */
  existing: readonly StoredRow[];
  /** The edited document, as `parseMarkdownToForest` produced it. */
  incoming: readonly SerializedBlock[];
  /** The same handle set the parse ran with. */
  handles: readonly BlockHandle<unknown>[];
}

/** One incoming node, flattened to document order with its structural parent. */
interface IncomingNode {
  node: IdentifiedBlock;
  /** Index into this array, or null for a top-level node. */
  parentIndex: number | null;
  type: string;
  data: unknown;
}

function flattenIncoming(forest: readonly IdentifiedBlock[]): IncomingNode[] {
  const out: IncomingNode[] = [];
  const walk = (nodes: readonly IdentifiedBlock[], parentIndex: number | null): void => {
    for (const node of nodes) {
      const index = out.length;
      out.push({ node, parentIndex, type: node.type, data: node.data ?? {} });
      walk(node.children, index);
    }
  };
  walk(forest, null);
  return out;
}

/** The runs a stored row currently projects. `[]` for a text-less row. */
function storedRuns(data: unknown): RichText {
  if (data === null || typeof data !== "object") return [];
  return runsOf((data as { text?: unknown }).text);
}

function runsEqual(a: RichText, b: RichText): boolean {
  return stableJson(coalesce(a)) === stableJson(coalesce(b));
}

/**
 * The `data` a survivor's update may carry: everything the incoming node says,
 * with `text` forced back to the row's CURRENT projection (invariant 1). For a
 * void target type the incoming payload passes through unchanged — including the
 * removal of a `text` key a text→void conversion leaves behind, which that
 * type's strict schema would otherwise reject at the write boundary.
 */
function survivorData(
  incoming: unknown,
  handle: BlockHandle<unknown> | undefined,
  currentRuns: RichText,
): unknown {
  if (!handle?.text) return incoming;
  const base =
    incoming !== null && typeof incoming === "object" && !Array.isArray(incoming)
      ? (incoming as Record<string, unknown>)
      : {};
  return { ...base, text: currentRuns };
}

export function planMarkdownApply(args: MarkdownApplyArgs): MarkdownApplyResult {
  const { rootId, pageId, existing, incoming, handles } = args;
  const byType = new Map(handles.map((h) => [h.type, h] as const));

  // The only markdown this module emits is a single `<page …/>` POINTER tag,
  // whose attribute values are quoted rather than inline-markdown-escaped — so
  // the inline token spans that `protectedSpans` exists to mask cannot reach it,
  // and an empty list is the honest answer rather than a forgotten parameter.
  const ctx: MarkdownContext = { handles: [...handles], protectedSpans: [] };

  // Everything below reads `oldRows`, never `existing`: the walk is the scope.
  const oldRows = documentOrderRows(existing, rootId);

  // --- Sub-page identity ----------------------------------------------------
  // A shell's identity is its ROW ID, which `<page id="…"/>` carries and no
  // `data` field does. Resolving the id out of an incoming pointer node without
  // naming a block type is done by SERIALIZING it: the tag is the contract, and
  // the serializer is the only thing that knows how a type encodes its identity
  // into one. A shell row and a pointer at that shell therefore emit the same
  // line, byte for byte, and string equality is the whole test.
  const pageTagName = pageBlockMarkdown.tag?.name ?? PAGE_BLOCK_TYPE;
  const pageRefType =
    handles.find((h) => markdownParseTagName(h) === pageTagName)?.type ?? null;
  const hasPageHandle = byType.has(PAGE_BLOCK_TYPE);
  const pointerLine = (type: string, data: unknown, id?: string): string =>
    serializeForestToMarkdown([{ id, type, data, expanded: false, children: [] }], ctx);
  const shellByLine = new Map<string, StoredRow>();
  if (hasPageHandle) {
    for (const row of oldRows) {
      if (row.type !== PAGE_BLOCK_TYPE) continue;
      shellByLine.set(pointerLine(row.type, row.data, row.id), row);
    }
  }

  const oldItems: AlignItem[] = oldRows.map((row) => {
    const handle = byType.get(row.type);
    const shell = row.type === PAGE_BLOCK_TYPE;
    return {
      key: shell ? pinnedShellKey(row.id) : identityKeyOf(row.type, row.data, handle),
      plain: plainTextOf(row.data, handle),
      type: row.type,
      pin: shell ? row.id : null,
    };
  });
  // The page references this document ALREADY holds. A markdown apply may keep,
  // move or drop one of those; what it may not do is INVENT one, because a pure
  // planner cannot check that an id it has never seen names a real page. This is
  // what keeps a legitimate `page-link` block round-tripping (its key is in here)
  // while a hand-typed `<page id="typo"/>` is refused.
  const existingKeys = new Set(
    oldItems.filter((item) => item.pin === null).map((item) => item.key),
  );

  const identified = withMintedIds([...incoming]);
  const incomingNodes = flattenIncoming(identified);

  const newItems: AlignItem[] = [];
  const shellRefs = new Set<string>();
  for (const entry of incomingNodes) {
    if (entry.type === PAGE_BLOCK_TYPE) {
      // Not a refusal but a programming error: markdown parse alone can never
      // mint a sub-page (`<page/>` is claimed by the pointer type), so a `page`
      // node here came from a hand-built forest, and minting a `page_id`
      // partition is the server's turn-into-page op, never a diff's.
      throw new Error(
        `planMarkdownApply: the incoming forest contains a "${PAGE_BLOCK_TYPE}" node. ` +
          "A markdown apply can never mint a sub-page — use POST /api/blocks/:id/turn-into-page.",
      );
    }
    const handle = byType.get(entry.type);
    const contentKey = identityKeyOf(entry.type, entry.data, handle);
    let pin: string | null = null;
    if (pageRefType !== null && entry.type === pageRefType) {
      const shell = shellByLine.get(pointerLine(entry.type, entry.data));
      if (shell !== undefined) {
        if (shellRefs.has(shell.id)) {
          return {
            ok: false,
            reason: "subpage-reparented",
            detail:
              `The document references sub-page ${shell.id} more than once. ` +
              "A sub-page shell is one row and can occupy one position; honouring " +
              "this would require it to be in two places at once.",
          };
        }
        if (entry.node.children.length > 0) {
          throw new Error(
            `planMarkdownApply: sub-page ${shell.id} was given children. Its content ` +
              "lives in its own page_id partition and cannot be authored through the pointer.",
          );
        }
        shellRefs.add(shell.id);
        pin = shell.id;
      } else if (!existingKeys.has(contentKey)) {
        return {
          ok: false,
          reason: "unknown-page-ref",
          detail:
            `The document references a page that is neither a sub-page inside ${rootId} ` +
            "nor a page this document already links to. A markdown apply cannot mint " +
            "a reference to a page it has no way to verify exists.",
        };
      }
    }
    newItems.push({
      key: pin === null ? contentKey : pinnedShellKey(pin),
      plain: plainTextOf(entry.data, handle),
      type: entry.type,
      pin,
    });
  }

  const pairs = alignItems(oldItems, newItems);
  const usedOld = new Set(pairs.values());

  // --- Identity: survivors keep their row id, the rest are minted ------------
  // Ids ride ON the node (`withMintedIds`), so a created node's children resolve
  // their parent through the same array they were flattened from — a positional
  // id list would silently mis-assign under any traversal change.
  const finalId = incomingNodes.map((entry, j) => {
    const oldIndex = pairs.get(j);
    return oldIndex === undefined ? entry.node.id : oldRows[oldIndex]!.id;
  });
  // A top-level node of the incoming document is a child of the SCOPE's root —
  // the page row for a whole-page apply, the addressed block for a scoped one.
  const parentIdOf = (j: number): string => {
    const parentIndex = incomingNodes[j]!.parentIndex;
    return parentIndex === null ? rootId : finalId[parentIndex]!;
  };

  // --- Ranks: one sibling list at a time ------------------------------------
  const groups = new Map<string, number[]>();
  for (let j = 0; j < incomingNodes.length; j++) {
    const parent = parentIdOf(j);
    const list = groups.get(parent);
    if (list) list.push(j);
    else groups.set(parent, [j]);
  }
  const finalRank = new Array<string>(incomingNodes.length);
  for (const [parent, indices] of groups) {
    const ranks = planSiblingRanks(
      indices.map((j) => {
        const oldIndex = pairs.get(j);
        if (oldIndex === undefined) return null;
        const row = oldRows[oldIndex]!;
        // A rank is only meaningful inside one `(parent_id, rank)` space, so a
        // survivor arriving from a different parent has no rank HERE.
        return row.parentId === parent ? row.rank : null;
      }),
    );
    indices.forEach((j, k) => {
      finalRank[j] = ranks[k]!;
    });
  }

  // --- The patch ------------------------------------------------------------
  const updates: BlockUpdate[] = [];
  const textEdits: MarkdownTextEdit[] = [];
  let moved = 0;

  for (let j = 0; j < incomingNodes.length; j++) {
    const oldIndex = pairs.get(j);
    if (oldIndex === undefined) continue;
    const row = oldRows[oldIndex]!;
    const entry = incomingNodes[j]!;
    const changes: BlockFieldChanges = {};

    const parent = parentIdOf(j);
    if (row.parentId !== parent) changes.parentId = parent;
    if (row.rank !== finalRank[j]!) changes.rank = Rank.from(finalRank[j]!);

    // A matched sub-page shell is REPOSITIONED and nothing else. Its incoming
    // counterpart is a pointer block, so honouring `type`/`data` from it would
    // turn a whole page into a link to itself.
    if (row.type !== PAGE_BLOCK_TYPE) {
      const handle = byType.get(entry.type);
      const currentRuns = storedRuns(row.data);
      const nextData = survivorData(entry.data, handle, currentRuns);
      if (row.type !== entry.type) changes.type = entry.type;
      if (!dataEqual(row.data, nextData)) changes.data = nextData;
      if (handle?.text) {
        const nextRuns = handle.text(entry.data);
        if (!runsEqual(currentRuns, nextRuns)) {
          textEdits.push({ blockId: row.id, runs: coalesce(nextRuns) });
        }
      }
    }

    if (Object.keys(changes).length > 0) {
      updates.push({ id: row.id, changes });
      if (changes.parentId !== undefined || changes.rank !== undefined) moved += 1;
    }
  }

  const now = new Date();
  const creates: Block[] = [];
  for (let j = 0; j < incomingNodes.length; j++) {
    if (pairs.has(j)) continue;
    const entry = incomingNodes[j]!;
    creates.push({
      id: finalId[j]!,
      // Every created row belongs to the page — NOT to `rootId`, which is a
      // position in the forest, not a partition. The only node that could open a
      // new `page_id` partition is a `page` row, which is refused above.
      pageId,
      parentId: parentIdOf(j),
      type: entry.type,
      // A brand-new id has no content doc, so its row IS the seed — the one
      // place `text` legally rides a row write.
      data: entry.data,
      rank: Rank.from(finalRank[j]!),
      expanded: entry.node.expanded,
      createdAt: now,
      updatedAt: now,
    });
  }

  // --- Sub-pages are never deleted by a markdown apply ----------------------
  // A shell owns an entire other `page_id` partition, so dropping one destroys a
  // page tree. A shell the document did not mention is PRESERVED — kept at the
  // top level, after everything the document did say. Removing a sub-page stays
  // an explicit act, never an inferred one.
  const preservedShells = oldRows.filter(
    (row, i) => row.type === PAGE_BLOCK_TYPE && !usedOld.has(i),
  );

  // That re-home is only correct when the root IS the page: "the top level" is
  // where a shell the document dropped legitimately belongs. Under a NESTED root
  // the same move would drag a whole page tree INTO the addressed block —
  // inventing a placement the document never asked for, from an omission. So it
  // is a refusal instead. In practice unreachable, because a scoped read emits
  // every shell in scope and a faithfully-edited document still names them,
  // which is exactly why it must be loud rather than quietly tolerated.
  if (rootId !== pageId && preservedShells.length > 0) {
    return {
      ok: false,
      reason: "subpage-removed",
      detail:
        `The document dropped sub-page ${preservedShells.map((s) => s.id).join(", ")} ` +
        `from inside block ${rootId}. A sub-page owns its own page and can never be ` +
        "deleted by a markdown apply; nor can it be lifted out of the block this " +
        "apply is scoped to, which is where preserving it would have to put it. " +
        "Re-read the block and keep every `<page id=\"…\"/>` pointer the document holds.",
    };
  }

  let floor = maxRank((groups.get(rootId) ?? []).map((j) => finalRank[j]!));
  const appended: StoredRow[] = [];
  for (const shell of preservedShells) {
    const rank = Rank.from(shell.rank);
    // Already sitting after everything the document placed: leave it exactly
    // where it is, and let it bound whatever is appended behind it. A shell
    // ANYWHERE else moves — its own sibling list was re-ranked without it, so
    // the only interval provably free of a collision is above the floor.
    if (shell.parentId === rootId && (floor === null || Rank.compare(rank, floor) > 0)) {
      floor = rank;
      continue;
    }
    appended.push(shell);
  }
  if (appended.length > 0) {
    const ranks = Rank.nBetween(floor, null, appended.length);
    appended.forEach((shell, k) => {
      const changes: BlockFieldChanges = { rank: ranks[k]! };
      if (shell.parentId !== rootId) changes.parentId = rootId;
      updates.push({ id: shell.id, changes });
      moved += 1;
    });
  }

  // Delete authority is bounded by the WALK, never by `existing`: `oldRows` is
  // the subtree rooted at `rootId`, so a row the walk did not reach is not a
  // candidate here no matter what the incoming document says. That one line is
  // the whole of what root-scoping buys — there is no second filter to keep in
  // sync with it.
  const deleteIds = oldRows
    .filter((row, i) => !usedOld.has(i) && row.type !== PAGE_BLOCK_TYPE)
    .map((row) => row.id);

  return {
    ok: true,
    plan: {
      patch: { creates, updates, deleteIds },
      textEdits,
      stats: {
        survived: pairs.size + preservedShells.length,
        created: creates.length,
        deleted: deleteIds.length,
        moved,
      },
    },
  };
}
