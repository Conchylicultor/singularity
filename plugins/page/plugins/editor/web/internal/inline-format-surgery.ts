import {
  $addUpdateTag,
  $getNodeByKey,
  $getSelection,
  $isElementNode,
  $isLineBreakNode,
  $isRangeSelection,
  $isRootNode,
  $isTextNode,
  type LexicalEditor,
  type LexicalNode,
  type TextNode,
} from "lexical";
import {
  matchInlineFormat,
  tokenOf,
  type InlineFormatMatch,
  type Mark,
} from "../../core";
import { getBlockTextExtensions } from "./block-text-extensions";
import { INLINE_FORMAT_TAG } from "./inline-format-tag";
import type { DelimiterDeletion } from "./mark-boundary";
import { $setCaretMarks } from "./mark-depth";

export { INLINE_FORMAT_TAG };

// Inline MARK surgery on a block's BOUND Lexical editor — the sibling of
// `collab-text-surgery.ts`, and the same doctrine: drive the change THROUGH
// LEXICAL (never hand-rolled `Y.XmlText` deltas) so the `CollaborationPlugin`
// binding syncs it into the block's `Y.Doc` exactly like typing, and pass
// `discrete: true` so that transaction lands synchronously inside the caller's
// `captureBlockDocEdit` window.
//
// Two mutations live here, and they are deliberately together rather than in two
// near-identical modules — both need the same paragraph-local leaf walk, the same
// `hasFormat`-guarded `toggleFormat` idiom (which is what makes the runs
// round-trip correct BY CONSTRUCTION), the same `INLINE_FORMAT_TAG` re-entrancy
// marker, and the same "plan now, re-verify later, abort on drift" contract:
//
//  - **`applyInlineFormat`** — markdown autoformat: typing `` `xxx` `` strips
//    both delimiters and applies the marks. The pure delimiter decision lives in
//    `core/inline-markdown.ts` (`matchInlineFormat`); this module is only the
//    Lexical read that feeds it and the Lexical write that realizes its answer.
//  - **`removeMarkSpan`** — the mark-boundary delimiter's deletion: Backspace on
//    the far side of a marked run drops the mark from that whole run. The pure
//    boundary decision lives in `internal/mark-boundary.ts`; same division.
//
// ---------------------------------------------------------------------------
// SCOPE RESTRICTION (`applyInlineFormat` only): the whole match must live inside
// the caret's own TextNode.
// ---------------------------------------------------------------------------
//
// This is a deliberate narrowing, not a simplification of something that should
// be general. Three things it buys:
//
//  1. **A contiguously typed `**xxx**` always IS one `TextNode`.** So the
//     restriction costs nothing in the case the affordance exists for.
//  2. **Every cross-node offset hazard disappears.** Node-local offsets are the
//     only basis in play — no linear-offset translation, no masking, and in
//     particular no `$placeCaretAtLinearOffset`, whose documented `<=` bias
//     resolves a run boundary to the END of the EARLIER leaf. A one-off
//     boundary error there would not mis-place a caret, it would slice the
//     wrong characters out of the user's text.
//  3. **The decorator token nodes are structurally untouchable.** `[[pageId]]`,
//     `[[date:iso]]` and `\(latex\)` are separate leaves whose
//     `getTextContent()` is `""`; a single-node match can neither read across
//     one nor split it.
//
// Accepted cost, documented rather than worked around: `**see [[page]] here**`
// does not auto-bold, because the span straddles a decorator leaf. Cmd+B still
// bolds it. The same is true of a span the user assembled by clicking around
// mid-word, which Lexical may hold as two adjacent `TextNode`s.

/**
 * The leaf immediately before `node` in the same PARAGRAPH, or `null` at the
 * paragraph's start.
 *
 * The climb stops at the root, so it never walks into the previous paragraph —
 * `matchInlineFormat` reasons about one line, and a flanking char borrowed from
 * another one would be a lie. It does step OUT of an inline wrapper (a
 * `LinkNode`) and INTO one (via `getLastDescendant`), because those are the same
 * visual line.
 *
 * Exported for the caret's mark-boundary read (`caret-geometry.ts`), which asks
 * the same question about the same scope: what leaf is on the other side of this
 * seam, without leaving the line.
 */
export function prevLeafInParagraph(node: LexicalNode): LexicalNode | null {
  let cursor: LexicalNode = node;
  for (;;) {
    const prev = cursor.getPreviousSibling();
    if (prev !== null) {
      return $isElementNode(prev) ? (prev.getLastDescendant() ?? prev) : prev;
    }
    const parent: LexicalNode | null = cursor.getParent();
    if (parent === null || $isRootNode(parent)) return null;
    cursor = parent;
  }
}

/** Mirror image of {@link prevLeafInParagraph}. */
export function nextLeafInParagraph(node: LexicalNode): LexicalNode | null {
  let cursor: LexicalNode = node;
  for (;;) {
    const next = cursor.getNextSibling();
    if (next !== null) {
      return $isElementNode(next) ? (next.getFirstDescendant() ?? next) : next;
    }
    const parent: LexicalNode | null = cursor.getParent();
    if (parent === null || $isRootNode(parent)) return null;
    cursor = parent;
  }
}

/**
 * The single character of `leaf` that flanks the candidate span — its last char
 * for the leaf before, its first for the leaf after.
 *
 * A `LineBreakNode` answers `undefined`: a soft break is a line boundary, and
 * "nothing there" is the matcher's permissive line-start/line-end answer, which
 * is exactly right. Anything else is read through `tokenOf`, so a decorator node
 * contributes its TOKEN text (`[[<pageId>]]`, `\(latex\)`) rather than the empty
 * string its `getTextContent()` returns — a `]` or `)`, i.e. punctuation, which
 * the matcher treats as a word boundary. That is the honest answer: a page-link
 * chip genuinely is not a word character, so `_x_` right after one should stay
 * eligible for italics.
 */
function flankChar(
  leaf: LexicalNode | null,
  side: "last" | "first",
): string | undefined {
  if (leaf === null) return undefined;
  if ($isLineBreakNode(leaf)) return undefined;
  const text = $isTextNode(leaf)
    ? leaf.getTextContent()
    : tokenOf(leaf, getBlockTextExtensions());
  if (text.length === 0) return undefined;
  return side === "last" ? text[text.length - 1] : text[0];
}

/**
 * Everything `applyInlineFormat` needs, plus everything it needs to prove the
 * live state has not drifted since the scan. `nodeText` is the node's FULL text
 * (not just the part before the caret) precisely so the re-verification is
 * total: same node, same bytes, same caret.
 */
export interface InlineFormatPlan {
  /** Key of the `TextNode` holding the whole match. */
  nodeKey: string;
  /** Caret offset WITHIN that node at detection time. */
  caretOffset: number;
  /** The node's FULL text at detection time — re-verified before mutating. */
  nodeText: string;
  /** The pure matcher's verdict, in that node's own offset basis. */
  match: InlineFormatMatch;
}

/**
 * Inside a Lexical READ: the inline format the caret just closed, or `null`.
 *
 * `null` is not an absorbed failure — "this keystroke closed nothing" is the
 * answer for nearly every keystroke, the same non-event `findTrigger` returns
 * `null` for in the caret-trigger primitive.
 */
export function $scanInlineFormat(): InlineFormatPlan | null {
  const selection = $getSelection();
  if (!$isRangeSelection(selection) || !selection.isCollapsed()) return null;
  const anchor = selection.anchor;
  if (anchor.type !== "text") return null;
  const node = anchor.getNode();
  if (!$isTextNode(node)) return null;
  // Segmented / token-mode nodes and `TextNode` SUBCLASSES are atomic as far as
  // this transform is concerned: `splitText` on a segmented node replaces the
  // node instead of slicing it, and a subclass carries semantics (an inline
  // token, a mention) that slicing its characters would destroy.
  if (!node.isSimpleText()) return null;
  // No markdown inside inline code — `` `a*b*` `` is code, and the `*`s in it
  // are literal. Same gate `@lexical/markdown` applies.
  if (node.hasFormat("code")) return null;

  const nodeText = node.getTextContent();
  const textBefore = nodeText.slice(0, anchor.offset);
  // A `TextNode`'s text never holds a "\n" here (`runs-lexical.ts` materializes
  // soft breaks as `LineBreakNode`s), and the whole plan depends on that: the
  // matcher CLAMPS its indices to the last line of what it is given, so a "\n"
  // would silently hand back offsets in a different basis than `nodeText`'s and
  // the slicing below would cut the wrong characters. Refusing is free.
  if (textBefore.includes("\n")) return null;

  // `charBefore` is the char before the START of `textBefore` — i.e. before this
  // NODE — so it always comes from the previous leaf, never from `textBefore`
  // itself. (The matcher only consults it when the opener it found sits at
  // offset 0; anywhere else it reads the flank out of the text directly.)
  // `charAfter` is the char after the CARET, which is inside this node unless
  // the caret sits at its end.
  const match = matchInlineFormat(textBefore, {
    charBefore: flankChar(prevLeafInParagraph(node), "last"),
    charAfter:
      anchor.offset < nodeText.length
        ? nodeText[anchor.offset]
        : flankChar(nextLeafInParagraph(node), "first"),
  });
  if (match === null) return null;
  return {
    nodeKey: node.getKey(),
    caretOffset: anchor.offset,
    nodeText,
    match,
  };
}

/**
 * Realize `plan`: strip both delimiters and apply its marks to what was between
 * them, as ONE discrete Lexical update. Returns `false` when the plan no longer
 * matches live state (aborted, nothing changed).
 *
 * `discrete: true` is load-bearing for the same reason as
 * `truncateBlockTextFrom`: the caller wraps this in `captureBlockDocEdit`, whose
 * capture window closes when the wrapper returns, so the binding's Yjs
 * transaction must land synchronously. Lexical's default commit is a microtask,
 * which would leak the edit past the boundary and mis-record it as a plain
 * typing entry — the exact undo bug this affordance exists to avoid.
 *
 * A consequence of that contract: this MUST be called from outside any
 * `editor.update()`. Inside one, Lexical *enqueues* the update rather than
 * running it, and the boundary would be gone by the time it ran. That is not a
 * silent degradation — see the `ran` check below.
 */
export function applyInlineFormat(
  editor: LexicalEditor,
  plan: InlineFormatPlan,
): boolean {
  // One mutable holder rather than two captured `let`s: TypeScript's
  // control-flow analysis does not reset a captured `let`'s narrowing across the
  // call that mutates it, so `if (!ran)` would type as provably dead code.
  const outcome: { ran: boolean; applied: boolean } = {
    ran: false,
    applied: false,
  };
  editor.update(
    () => {
      outcome.ran = true;
      // Our own re-entrancy marker: the update listener that produced this plan
      // drops any update carrying it, and the BLOCK-level markdown plugin drops
      // it too (stripping delimiters can leave a block prefix behind —
      // `~~- foo~~` strikes to `- foo`, which is not the user typing a bullet).
      //
      // Deliberately NOT `SKIP_DOM_SELECTION_TAG`: unlike split's background
      // truncation of the block the user is LEAVING, this caret placement must
      // reach the DOM — the user is standing right here and keeps typing.
      // Deliberately NOT `HISTORY_PUSH_TAG` either: there is no Lexical
      // `HistoryPlugin` in this app (the undo stack is the surface-level one),
      // so the tag would address a listener that does not exist.
      $addUpdateTag(INLINE_FORMAT_TAG);

      // --- Abort unless the plan still describes live state. -----------------
      // Stricter than the block-level plugin's "recompute the remainder at
      // flush time", and deliberately so: a stale PREFIX length merely
      // mis-converts a block type, whereas a stale offset here would slice
      // characters out of the middle of the user's sentence. Re-running the
      // scan instead would be a second, subtly different matcher call site.
      const node = $getNodeByKey(plan.nodeKey);
      if (!$isTextNode(node)) return;
      if (node.getTextContent() !== plan.nodeText) return;
      const selection = $getSelection();
      if (!$isRangeSelection(selection) || !selection.isCollapsed()) return;
      const anchor = selection.anchor;
      if (anchor.type !== "text") return;
      if (anchor.key !== plan.nodeKey || anchor.offset !== plan.caretOffset)
        return;

      // The caret's PENDING typing style — what the next typed character would
      // have carried. Restored onto the post-transform caret in the last step.
      const preFormat = selection.format;
      const preStyle = selection.style;

      const { openStart, closeStart, tagLength, marks } = plan.match;
      const full = plan.nodeText;
      // ONE `setTextContent` removing BOTH delimiters — there is no intermediate
      // state in which only the opener (or only the closer) is gone, so no
      // transform, listener or reconcile can ever observe a half-stripped span.
      // `plan.caretOffset === closeStart + tagLength` (the typed char closed the
      // span), so the third slice is exactly the text that followed the caret.
      const newText =
        full.slice(0, openStart) +
        full.slice(openStart + tagLength, closeStart) +
        full.slice(plan.caretOffset);
      const contentStart = openStart;
      const contentEnd = openStart + (closeStart - openStart - tagLength);
      node.setTextContent(newText);

      // `splitText` sorts its offsets, appends the text length, and skips
      // zero-length segments — so it returns the parts IN ORDER and the content
      // part's index is 1 when a leading part exists and 0 when it does not.
      // Both indices are always populated: the matcher guarantees non-empty
      // content (`openStart + tagLength < closeStart`), and `contentStart > 0`
      // guarantees a non-empty leading part.
      const parts = node.splitText(contentStart, contentEnd);
      const contentNode: TextNode = parts[contentStart > 0 ? 1 : 0]!;

      // NODE-level and `hasFormat`-guarded. This is byte-identically what
      // `runs-lexical.ts`'s `styleTextNode` does when materializing stored runs
      // (`node.toggleFormat(mark)`), which is why the round trip is correct BY
      // CONSTRUCTION rather than by testing: the serializer's `marksOf` reads
      // back exactly these format bits, in `MARK_ORDER`.
      //
      // The `hasFormat` guard is what makes `` `code` `` typed INSIDE a bold run
      // add code and keep bold: a bare toggle would flip bold off, because the
      // split parts inherit the enclosing run's format. Toggling only the marks
      // the node does not already carry makes the operation "add these marks",
      // which is what the syntax means.
      //
      // Not `FORMAT_TEXT_COMMAND` — a command dispatch runs `RichTextPlugin`'s
      // handler and every other listener at that priority, for no gain here.
      // Not `RangeSelection.formatText` either: a freshly created selection has
      // `format === 0`, which makes toggle-vs-set semantics implicit over a
      // partially formatted range.
      for (const mark of marks) {
        if (!contentNode.hasFormat(mark)) contentNode.toggleFormat(mark);
      }

      // Collapse immediately AFTER the formatted content — which is before
      // whatever followed the caret, since the single `setTextContent` above
      // preserved that tail verbatim.
      const size = contentNode.getTextContentSize();
      const next = contentNode.select(size, size);
      // Restore the snapshotted typing style rather than hard-zeroing it. In the
      // ordinary case `preFormat === 0`, so the mark is OFF for text typed next
      // (what every editor does); an already-active italic/color context, on the
      // other hand, survives instead of being silently cancelled by an
      // autoformat. Lexical carries this across the DOM round trip on its own:
      // the reconciler sees a collapsed selection whose format differs from its
      // anchor node's and calls `markCollapsedSelectionFormat`, which the
      // ensuing `selectionchange` honors instead of re-deriving from the node.
      next.setFormat(preFormat);
      next.setStyle(preStyle);
      outcome.applied = true;
    },
    { discrete: true },
  );
  if (!outcome.ran) {
    // Loud on purpose. `discrete: true` only commits synchronously when no
    // update is already in flight; called from inside one, Lexical would queue
    // this and `applied === false` would read as a harmless drift-abort while
    // the undo boundary silently vanished. See the `queueMicrotask` contract in
    // `inline-markdown-plugin.tsx`.
    throw new Error(
      "applyInlineFormat: the discrete update was enqueued, not committed — it must be called outside editor.update() / an update listener",
    );
  }
  return outcome.applied;
}

// ---------------------------------------------------------------------------
// The mark boundary's delimiter: deleting it drops the mark
// ---------------------------------------------------------------------------

/**
 * Everything `removeMarkSpan` needs, plus everything it needs to prove the live
 * state has not drifted since the scan — the {@link InlineFormatPlan} shape, for
 * the same reason: the mutation is DEFERRED one microtask (see
 * `removeMarkSpan`), so the caret it was planned against may be gone by the time
 * it runs.
 */
export interface MarkSpanPlan {
  /** Key of the `TextNode` the caret was anchored in. */
  anchorKey: string;
  /** Caret offset WITHIN that node at detection time. */
  anchorOffset: number;
  /** The node's FULL text at detection time — re-verified before mutating. */
  anchorText: string;
  /** What deleting the delimiter does — which marks come off which side. */
  delimiter: DelimiterDeletion;
}

/**
 * Inside a Lexical READ: the mark span the caret's delimiter would strip, or
 * `null` when the caret is not on a text anchor.
 *
 * `null` is not an absorbed failure — it is the same non-event
 * {@link $scanInlineFormat} answers `null` for. The resolver has already decided
 * this keystroke IS a delimiter deletion; this only snapshots the live position
 * it will be re-verified against.
 */
export function $scanMarkSpan(
  delimiter: DelimiterDeletion,
): MarkSpanPlan | null {
  const selection = $getSelection();
  if (!$isRangeSelection(selection) || !selection.isCollapsed()) return null;
  const anchor = selection.anchor;
  if (anchor.type !== "text") return null;
  const node = anchor.getNode();
  if (!$isTextNode(node)) return null;
  return {
    anchorKey: node.getKey(),
    anchorOffset: anchor.offset,
    anchorText: node.getTextContent(),
    delimiter,
  };
}

/**
 * Inside a Lexical UPDATE: strip `marks` from the maximal contiguous span of
 * leaves that carry them, walking outward from `start`. Returns whether anything
 * changed.
 *
 * The walk stops at a leaf without the mark (the opener's position, correct by
 * construction), at a decorator or line break (both UNMARKED in the runs model,
 * so a mark span across a soft break is genuinely two spans — documented, not
 * "fixed"), or at the paragraph edge. Nodes that differ in some OTHER attribute
 * are separate `TextNode`s but all carry the mark, so the whole span goes —
 * right, since `coalesce()` guarantees distinct-attributes ⇒ distinct node.
 */
function $stripMarkSpan(
  start: LexicalNode | null,
  marks: readonly Mark[],
  dir: "before" | "after",
): boolean {
  let applied = false;
  for (const mark of marks) {
    let cursor: LexicalNode | null = start;
    while (cursor !== null && $isTextNode(cursor) && cursor.hasFormat(mark)) {
      // Resolve the neighbour BEFORE mutating, so the walk never reads a sibling
      // relation through a node it has just made writable.
      const next: LexicalNode | null =
        dir === "before"
          ? prevLeafInParagraph(cursor)
          : nextLeafInParagraph(cursor);
      // NODE-level and `hasFormat`-guarded, byte-identically to
      // `applyInlineFormat` above and to `runs-lexical.ts`'s `styleTextNode` —
      // which is why the serializer reads back exactly what is left here.
      cursor.toggleFormat(mark);
      applied = true;
      cursor = next;
    }
  }
  return applied;
}

/**
 * Realize `plan`: delete the boundary's delimiter — strip each of its marks from
 * the maximal contiguous span of leaves carrying it — as ONE discrete Lexical
 * update. Returns `false` when the plan no longer matches live state (aborted,
 * nothing changed).
 *
 * The `discrete: true` + must-be-called-outside-an-update contract is byte-for-
 * byte {@link applyInlineFormat}'s, including the loud throw — a Lexical command
 * listener runs INSIDE an `editor.update()`, where a nested discrete update is
 * *enqueued rather than committed*, and the caller's `captureBlockDocEdit` window
 * would already have closed. Hence the executor's `queueMicrotask`.
 *
 * **Both sides are walked, from the two leaves the boundary sits between.** A
 * mark lives on exactly ONE side of a boundary (that is what makes it part of the
 * delimiter at all), so a one-directional walk from the anchor reaches only the
 * marks of the anchor's own side and silently no-ops on the other's. That was
 * survivable while every covered boundary had its marks on the anchor's side; it
 * is not, now that the caret can stand on a stop whose marked run is across the
 * seam (`` a|`zz` ``), where a one-sided Backspace would strip nothing at all.
 *
 * Which leaf starts which walk is STRUCTURAL, not a flag: a boundary only exists
 * at a leaf EDGE, so an anchor offset above 0 puts the left run in the anchor's
 * own node and anything else puts it in the previous leaf (mirrored on the
 * right). An empty anchor node — both edges at once — is skipped by both walks,
 * which is right: it carries no text, and its own bits are not either run's.
 *
 * **The caret IS repaired**, to `plan.delimiter.residual`. It is standing on the
 * stop, carrying the FAR side's marks, and the strip has just taken those marks
 * off the far side; without the repair the next character typed would re-mint the
 * mark the user just deleted. The repair is a no-op at every block edge (where
 * the residual and the stop's marks coincide), which is why nothing needed it
 * while the stop's mark set was miscomputed as `left ∩ right`.
 */
export function removeMarkSpan(
  editor: LexicalEditor,
  plan: MarkSpanPlan,
): boolean {
  const outcome: { ran: boolean; applied: boolean } = {
    ran: false,
    applied: false,
  };
  editor.update(
    () => {
      outcome.ran = true;
      // Same re-entrancy marker as the autoformat: this is a programmatic format
      // mutation, not the user typing, so neither markdown plugin may read it as
      // a delimiter or a block prefix being typed.
      $addUpdateTag(INLINE_FORMAT_TAG);

      // --- Abort unless the plan still describes live state. -----------------
      const node = $getNodeByKey(plan.anchorKey);
      if (!$isTextNode(node)) return;
      if (node.getTextContent() !== plan.anchorText) return;
      const selection = $getSelection();
      if (!$isRangeSelection(selection) || !selection.isCollapsed()) return;
      const anchor = selection.anchor;
      if (anchor.type !== "text") return;
      if (anchor.key !== plan.anchorKey || anchor.offset !== plan.anchorOffset)
        return;

      const size = node.getTextContentSize();
      const leftLeaf = plan.anchorOffset > 0 ? node : prevLeafInParagraph(node);
      const rightLeaf =
        plan.anchorOffset < size ? node : nextLeafInParagraph(node);
      const before = $stripMarkSpan(leftLeaf, plan.delimiter.before, "before");
      const after = $stripMarkSpan(rightLeaf, plan.delimiter.after, "after");
      outcome.applied = before || after;
      if (outcome.applied) $setCaretMarks(selection, plan.delimiter.residual);
    },
    { discrete: true },
  );
  if (!outcome.ran) {
    throw new Error(
      "removeMarkSpan: the discrete update was enqueued, not committed — it must be called outside editor.update() / an update listener",
    );
  }
  return outcome.applied;
}
