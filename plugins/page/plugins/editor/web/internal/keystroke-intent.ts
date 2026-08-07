// The single intent-resolution step for the block editor.
//
// Every caret-affecting keystroke (Enter/Backspace/Tab/Arrows) flows through one
// pure function: `resolveKeystroke(key, mods, caret, ctx) → KeyIntent`. It owns
// ALL the decisions that used to be scattered across `keyboard-plugin.tsx` and
// the `makeBlockAPI` methods — split-asChild, merge-vs-outdent, indent/outdent
// guards, and "is the caret on a visual edge so we should cross blocks". The
// executor (keyboard-plugin) just maps the returned intent to a thin API call.
//
// Pure module (no React, no Lexical, no DOM): unit-tested directly.
//
// Two rungs sit ABOVE the ladders rather than inside them — the virtual
// mark-delimiter step (Arrows) and its deletion (Backspace/Delete). Both are
// gated so tightly that the ladders below them are unchanged: the deletion rung
// fires only at `caret.escaped`, i.e. only after our own arrow step in the same
// interaction, and that is the safety property of the whole affordance. A
// Backspace nobody preceded with a step still merges, outdents and resets types
// exactly as it always did.

import {
  childrenOf,
  collapsedAnchorAbove,
  nextVisibleLine,
  prevVisibleLine,
  visibleChildrenOf,
  type BlockNode,
  type Mark,
} from "../../core";
import type { CaretContext } from "./caret-geometry";
import {
  delimiterDeletion,
  virtualStop,
  type DelimiterDeletion,
} from "./mark-boundary";

export type KeystrokeKey =
  | "Enter"
  | "Backspace"
  | "Delete"
  | "Tab"
  | "ArrowUp"
  | "ArrowDown"
  | "ArrowLeft"
  | "ArrowRight";

/**
 * What a keystroke resolves to.
 * - `passthrough` — not ours; let Lexical/the browser handle it natively.
 * - `noop` — ours, but nothing to do; consume the event (e.g. Tab with no prev
 *   sibling must not move focus or insert a tab).
 */
export type KeyIntent =
  | {
      type: "split";
      position: number;
      asChild: boolean;
      childType?: string;
      siblingType?: string;
      /**
       * Per-type-transformed `data` for the tail block when the split produces a
       * tail of the SAME type (e.g. a checked to-do splits into an unchecked one).
       * Resolved here via the block's `dataOnSplit` and carried through the op as
       * `tailData`; the reducer overwrites `.text` regardless. Absent = inherit.
       */
      tailData?: unknown;
    }
  | { type: "convertTo"; to: string } // reset block type (Backspace-at-start / empty-Enter)
  | { type: "merge" } // backspace at start, top-level → merge into prev sibling
  | { type: "mergeNext" } // delete at end → merge the next visible line up into this block
  | { type: "outdent" } // backspace at start when indented, or shift+tab
  /**
   * Open a COLLAPSED container from a structural keystroke on the line it
   * borrows (`blockId` is the CONTAINER's id, not the caret's block).
   *
   * You cannot restructure what you cannot see. The borrowed line is the only
   * line a collapsed container shows, so every structural keystroke there would
   * otherwise act on lines the user has no way of knowing are around: Backspace
   * would `unwrap` and spill the hidden children into the document, and
   * Shift+Tab would make the escaping block ADOPT them (`outdentOne` takes the
   * followers). Opening first spends one press per structural level — the same
   * bargain empty-Enter's ladder already makes — and the next press then acts on
   * a document the user can see.
   */
  | { type: "expand"; blockId: string }
  /**
   * Backspace at the start of a container anchor's FIRST child: dissolve the
   * container (`blockId` is the ANCHOR's id, not the caret's block) and promote
   * its children into its slot. Not the generic `outdent` rung: `outdentOne`
   * adopts the followers, so outdenting the first child would pop it out of the
   * box AND take the rest of the container's content with it as its own
   * children — a re-nesting nobody asked for.
   */
  | { type: "unwrap"; blockId: string }
  /**
   * Cross an inline-mark boundary's VIRTUAL DELIMITER: set the caret's pending
   * marks to `marks` and move its depth to `escaped`. The linear offset does not
   * change — the delimiter is an invisible position, not a character — so the
   * executor consumes the keystroke and every reducer path sees the same numbers
   * it saw before.
   *
   * `escaped: true` is the step OUT (onto the far side of the delimiter, where
   * typing is unmarked); `escaped: false` is the step back IN.
   */
  | { type: "markStep"; marks: Mark[]; escaped: boolean }
  /**
   * Move the caret one position to `offset` AND land it on the delimiter stop
   * there, as one press.
   *
   * The arrival half of the same model. A seam holds two states and the correct
   * landing is the one nearest the side the caret came from, but the browser
   * always delivers `natural` — so on the approach where the stop is the nearer
   * state, letting the browser move would skip it silently. This intent is that
   * press: the executor places the caret (through the same resolver the lookahead
   * read) and asserts the stop, so `across → stop → inside` going one way mirrors
   * `inside → stop → across` going the other.
   */
  | { type: "markArrive"; offset: number; marks: Mark[] }
  /**
   * Delete an inline-mark boundary's virtual delimiter — which, since the
   * delimiter is what carries the marks that CHANGE across the boundary, means
   * reducing both runs to the marks they share. The markdown-source behavior,
   * without markdown source.
   *
   * The payload is split by side ({@link DelimiterDeletion}) because a mark only
   * ever lives on ONE side of the boundary and the strip walks outward from the
   * seam: an anchor sitting in the left run cannot reach a `right \ left` mark by
   * walking its own side.
   *
   * Reachable ONLY at `caret.escaped` — see the rung in `Backspace` below.
   */
  | { type: "unmark"; delimiter: DelimiterDeletion }
  | { type: "indent" } // tab
  | { type: "nav"; dir: "up" | "down" | "left" | "right" }
  | { type: "selectBlock"; extend?: "up" | "down" } // shift+arrow at a visual edge
  | { type: "noop" }
  | { type: "passthrough" };

export interface IntentContext {
  /** The live block forest (reducer-shape nodes). */
  nodes: BlockNode[];
  /** The block whose editor fired the keystroke. */
  blockId: string;
  /**
   * Does this node's TYPE carry editable text? Resolved from the block handle's
   * derived `acceptsText` (`"text" in schema.shape`) by the consumer, because the
   * resolver may not name a block type and cannot see the registry.
   *
   * Both structural deletions across a line break gate on it. Merging text INTO a
   * void row writes `data.text` onto a schema that has none — a 400 at the write
   * boundary — and merging one AWAY deletes a row whose content is not text (a
   * sub-page's whole subtree, a container's box). This one predicate replaces the
   * two hardcoded `PAGE_BLOCK_TYPE` comparisons that used to guard it, so the
   * same protection now covers every void type: container anchors, `divider`,
   * `image`, `embed`, `file` — for which Delete at the end of the line directly
   * above was a live 400 (and, for an anchor, dissolved the box in one keypress).
   *
   * An UNRESOLVED type (no registered handle) is treated as text-less: refusing
   * demotes the keystroke to a caret move, while wrongly assuming text would hand
   * the write boundary a payload it rejects.
   */
  acceptsText(node: BlockNode): boolean;
  /**
   * Is this node a container ANCHOR (`BlockHandle.anchor`) — a row that renders
   * no line of its own, whose content IS its children? Supplied the same way as
   * `acceptsText`, from the block handle.
   */
  isAnchor(node: BlockNode): boolean;
  /**
   * The current block's declarative edit policy, resolved once at the consumer
   * from the block's handle (no prop drilling). `asChild`/`childType`/`splitInto`
   * cover the Enter-split shape (nest as a child, or split into a different
   * sibling type — e.g. a heading yields a body paragraph), while
   * `resetToOnBackspaceAtStart`/`breakOutOnEmptyEnter` drive the type-reset
   * branches below — all generic, the resolver never names a block type.
   */
  editPolicy?: {
    asChild?: boolean;
    childType?: string;
    splitInto?: string;
    resetToOnBackspaceAtStart?: string;
    breakOutOnEmptyEnter?: string;
    /**
     * Transform the tail block's `data` when a split produces a tail of the SAME
     * type (resolved from the block handle's `dataOnSplit`). Applied only when the
     * tail type equals the origin type — a heading→text end-split must not run the
     * heading's transform against the text schema.
     */
    dataOnSplit?: (data: unknown) => unknown;
  };
}

/**
 * A block is "indented" when its parent is a normal content block, not its own
 * page. Per-row (`node.pageId` is the nearest page ancestor), so over a spliced
 * multi-page union an inner page's top-level block is NOT indented — its parent
 * is its own page's shell row, and outdenting would cross the page boundary.
 */
function isIndented(node: BlockNode): boolean {
  return node.parentId !== null && node.parentId !== node.pageId;
}

/**
 * The container ANCHOR `node` is the first child of, or null. Rank-first among
 * the anchor's children, so a later child is not one (its Backspace has a visible
 * line above it inside the box and takes the ordinary ladder).
 */
function firstChildAnchor(
  ctx: IntentContext,
  node: BlockNode,
): BlockNode | null {
  if (node.parentId === null) return null;
  const parent = ctx.nodes.find((n) => n.id === node.parentId);
  if (!parent || !ctx.isAnchor(parent)) return null;
  return childrenOf(ctx.nodes, parent.id)[0]?.id === node.id ? parent : null;
}

function hasPrevSibling(nodes: BlockNode[], node: BlockNode): boolean {
  const siblings = childrenOf(nodes, node.parentId);
  return siblings.findIndex((s) => s.id === node.id) > 0;
}

function hasNextSibling(nodes: BlockNode[], node: BlockNode): boolean {
  const siblings = childrenOf(nodes, node.parentId);
  const idx = siblings.findIndex((s) => s.id === node.id);
  return idx !== -1 && idx < siblings.length - 1;
}

/**
 * Does `node` show children BELOW it right now? `visibleChildrenOf`, not the raw
 * `expanded` flag — inside a collapsed container the borrowed line's own children
 * are sealed away, so a flag-based answer would nest an Enter-at-end into a slot
 * nobody can see (and light the excess-indentation rung against lines that are
 * not on screen).
 */
function hasVisibleChildren(ctx: IntentContext, node: BlockNode): boolean {
  return visibleChildrenOf(ctx.nodes, node, ctx.isAnchor).length > 0;
}

/**
 * Is `node`'s own indentation EXCESS — does it sit DEEPER than the visible line
 * below it (or is it the last visible line, whose reference depth is the top
 * level)? This is what decides the ORDER of Backspace's two middle rungs: only
 * excess indentation is nearer to the caret than the line break above.
 *
 * Stated on depth, computed structurally, because the two are the same predicate:
 * `nextVisibleLine` returns the first visible CHILD when there is one (deeper),
 * else the next SIBLING when there is one (same depth), else a following sibling
 * of some ANCESTOR (strictly shallower) or nothing. So "the next visible line is
 * shallower, or there is none" ⟺ "no visible children and no next sibling" ⟺
 * `node` is the last visible line inside its parent.
 *
 * Corollary worth keeping in mind when touching this: because excess implies no
 * next sibling, the outdent this gates has NO followers to adopt — it is always a
 * pure move, never the silent re-nesting that `unwrap` exists to avoid.
 */
function hasExcessIndentation(ctx: IntentContext, node: BlockNode): boolean {
  return !hasVisibleChildren(ctx, node) && !hasNextSibling(ctx.nodes, node);
}

// ---------------------------------------------------------------------------
// The virtual mark delimiter
// ---------------------------------------------------------------------------
//
// Every inline-mark boundary behaves as if it held an invisible one-character
// delimiter: one arrow press crosses it, and one Backspace/Delete deletes it —
// which, the delimiter being what carries the mark, drops the mark from the run.
// The model and the arithmetic are `internal/mark-boundary.ts`; these two rungs
// are only where the keystrokes land on it.
//
// Both return null (not an intent) for the overwhelmingly common case of a caret
// that is nowhere near a delimiter, so the ladders below run EXACTLY as they did
// before — see the `escaped` gate on the deletion rung for why that matters.

/**
 * The delimiter step `dir` makes at the caret, or null when it makes none.
 *
 * A delimiter has two sides and the caret is on one of them, so the arrow that
 * crosses it out is fixed by the boundary (`virtualStop`) and the
 * opposite arrow is the only way back. Each is a no-op from the wrong depth,
 * which is what leaves ordinary caret movement — a press of the same key one
 * position earlier, or one press later — completely untouched.
 */
function markStepFor(
  caret: CaretContext,
  dir: "left" | "right",
): KeyIntent | null {
  if (caret.boundary === null) return null;
  const stop = virtualStop(caret.boundary);
  if (stop === null) return null;
  if (dir === stop.direction) {
    return caret.escaped
      ? null
      : { type: "markStep", marks: stop.marks, escaped: true };
  }
  return caret.escaped
    ? { type: "markStep", marks: caret.boundary.natural, escaped: false }
    : null;
}

/**
 * The delimiter ARRIVAL `dir` makes, or null when the browser's own landing is
 * already right.
 *
 * At a seam the caret has two states — `natural` and the virtual stop — laid out
 * in the order `virtualStop` gives. Traversal must visit the one nearest
 * the approach first, so:
 *
 *   ...aaa | stop | a...        (a seam whose stop lies RIGHT of `natural`)
 *          ^natural
 *
 * arriving RIGHTWARD meets `natural` first (the browser's landing — correct,
 * nothing to do), and arriving LEFTWARD meets the STOP first (the browser lands on
 * `natural` and the stop is skipped — this rung). The condition is therefore
 * "the stop sits on the side we are coming FROM", i.e. the stop's direction is
 * the opposite of the travel direction; the mirrored seam (stop LEFT of `natural`,
 * which is what a block-start boundary always is) is broken on the rightward
 * approach instead, by the same test.
 *
 * Ordered BELOW `markStepFor` at each arrow: a delimiter still to be crossed HERE
 * is nearer than one a step away.
 */
function markArriveFor(
  caret: CaretContext,
  dir: "left" | "right",
): KeyIntent | null {
  const dest =
    dir === "left" ? caret.stepLeftBoundary : caret.stepRightBoundary;
  if (dest === null) return null;
  const stop = virtualStop(dest);
  if (stop === null) return null;
  if (stop.direction === dir) return null; // the stop is on the far side — natural is right
  return {
    type: "markArrive",
    offset: caret.offset + (dir === "left" ? -1 : 1),
    marks: stop.marks,
  };
}

/**
 * The delimiter deletion a Backspace (`side: "before"`) or Delete
 * (`side: "after"`) makes at the caret, or null.
 *
 * **`caret.escaped` is the gate, and it is the safety property of the whole
 * feature.** Depth is not inferred from `selection.format` — it exists only
 * because our own `markStep` recorded it and the live anchor still verifies
 * (`internal/mark-depth.ts`). Three shipped mechanisms produce a caret whose
 * `selection.format` diverges from its node's bits WITHOUT being a delimiter
 * step: Cmd+E on a collapsed caret (a pure selection toggle by design),
 * `applyInlineFormat`'s `preFormat` restore onto every successful autoformat, and
 * `appendRunsAtJoin`'s caret landing at the end of a possibly-marked run. Under a
 * naive gate each of those would turn the next Backspace into a silent,
 * destructive strip of a whole span instead of deleting one character.
 *
 * Which KEY deletes the delimiter is the OPPOSITE of the direction the caret
 * escaped in: a step to the RIGHT leaves it behind the caret (Backspace's side),
 * a step to the LEFT puts it ahead (Delete's). That is a question about the
 * caret; which RUN loses which mark is a question about the document, answered
 * side-by-side in {@link delimiterDeletion} — the two used to be one field, and
 * conflating them is what made a Backspace at a seam whose marked run is on the
 * right walk the unmarked side and strip nothing.
 *
 * `virtualStop` returning non-null already guarantees the deletion is non-empty
 * (the two sides differ), so there is no "nothing to strip" arm to fall through.
 */
function unmarkFor(
  caret: CaretContext,
  side: "before" | "after",
): KeyIntent | null {
  if (!caret.escaped || !caret.collapsed || caret.boundary === null)
    return null;
  const stop = virtualStop(caret.boundary);
  if (stop === null) return null;
  if ((stop.direction === "right" ? "before" : "after") !== side) return null;
  return { type: "unmark", delimiter: delimiterDeletion(caret.boundary) };
}

export function resolveKeystroke(
  key: KeystrokeKey,
  mods: { shift: boolean },
  caret: CaretContext,
  ctx: IntentContext,
): KeyIntent {
  const node = ctx.nodes.find((b) => b.id === ctx.blockId);
  if (!node) return { type: "passthrough" };

  switch (key) {
    case "Enter": {
      // Shift+Enter inserts a soft newline (native).
      if (mods.shift) return { type: "passthrough" };
      const p = ctx.editPolicy;
      const position = caret.offset;
      // Empty-Enter escapes one structural level per press: indentation first
      // (outdent, keeping the type), then the type (convertTo), then ordinary
      // split. Note the convertTo/outdent order is deliberately OPPOSITE to
      // Backspace's — Backspace strips what's visually nearest the caret;
      // empty-Enter escapes nesting outward. Empty == the caret is at both the
      // start and the end. Blocks without the policy fall straight through to split.
      if (caret.atStart && caret.atEnd && p?.breakOutOnEmptyEnter) {
        if (isIndented(node)) return { type: "outdent" };
        if (node.type !== p.breakOutOnEmptyEnter)
          return { type: "convertTo", to: p.breakOutOnEmptyEnter };
        // Already top-level and already the target type: fall through to split.
      }
      // Every "is the caret at the end of the block?" decision gates on the live
      // caret edge (`caret.atEnd`), never the reducer node length: the latter lags
      // a just-applied markdown conversion (`### ` → heading) by one keystroke,
      // which would make the very next Enter miss the type swap or the nest.
      //
      // Honor an explicit policy `asChild`; otherwise nest the split-off content
      // as the first child only when splitting at the very end of a block that
      // has visible children (Notion's Enter-at-end behavior).
      const asChild =
        p?.asChild ?? (hasVisibleChildren(ctx, node) && caret.atEnd);
      // Enter at the END of a block can produce a sibling of a different type
      // (e.g. a heading yields a body paragraph). Mid-block splits keep the type.
      const siblingType = !asChild && caret.atEnd ? p?.splitInto : undefined;
      // Resolve the tail's `data` transform (e.g. a checked to-do → unchecked
      // tail) HERE, where block handles are visible. Guarded to the same-type case:
      // the tail's type is `childType` when nesting, `siblingType` when the end-
      // split swaps type, else the origin type. Running the origin's transform on a
      // tail validated against a DIFFERENT schema would corrupt it — so apply only
      // when the tail type equals the origin type.
      const tailType = asChild
        ? (p?.childType ?? node.type)
        : (siblingType ?? node.type);
      const tailData =
        p?.dataOnSplit && tailType === node.type
          ? p.dataOnSplit(node.data)
          : undefined;
      return {
        type: "split",
        position,
        asChild,
        childType: p?.childType,
        siblingType,
        tailData,
      };
    }
    case "Backspace": {
      // The nearest thing to the LEFT may be a virtual mark delimiter the caret
      // has ALREADY stepped past — the caret is then at a run's END, so
      // `atStart` is false and the guard below would hand this to native
      // deletion. The rung has to sit above it, and it fires ONLY at
      // `caret.escaped` (see `unmarkFor`): everything below this line is
      // therefore byte-for-byte the ladder that shipped, reachable only after an
      // explicit arrow step in the same interaction.
      const unmark = unmarkFor(caret, "before");
      if (unmark) return unmark;
      // Only a collapsed caret at the very start triggers structural intent;
      // anything else is ordinary text deletion (native).
      if (!caret.atStart || !caret.collapsed) return { type: "passthrough" };
      // Backspace deletes the nearest visible thing to the LEFT of the caret: a
      // type marker (bullet, checkbox, …) is visually nearest → reset the type;
      // then the enclosing structure → dissolve the container (its first child) or
      // outdent one level; then the line break above → merge into the previous
      // visible line; nothing left → step out (same as ArrowLeft).
      const p = ctx.editPolicy;
      if (
        p?.resetToOnBackspaceAtStart &&
        node.type !== p.resetToOnBackspaceAtStart
      )
        return { type: "convertTo", to: p.resetToOnBackspaceAtStart };
      // "Indentation" that is really a CONTAINER: the first child of an anchor
      // escapes the box by dissolving it, not by outdenting. This rung must sit
      // ABOVE the generic `isIndented` one because an anchor's child satisfies it
      // — and `outdentOne` would adopt the container's remaining lines as the
      // escaping block's own children (see the `unwrap` intent's doc), silently
      // re-nesting content the user never asked to nest.
      //
      // Only the FIRST child: it is the one whose escape would take the whole
      // box with it. A later line inside the container is an ordinary indented
      // block with lines of its own above it, so it keeps the generic rung.
      // ...but not while the box is CLOSED. On the borrowed line of a collapsed
      // container, `unwrap` would dissolve the box and promote children the user
      // cannot see into the document from one keypress. Open it first (one
      // structural level per press) and the next Backspace unwraps a container
      // whose contents are on screen. Above the `unwrap` rung, because the
      // borrowed line satisfies that one too.
      const closed = collapsedAnchorAbove(ctx.nodes, node, ctx.isAnchor);
      if (closed) return { type: "expand", blockId: closed.id };
      const anchor = firstChildAnchor(ctx, node);
      if (anchor) return { type: "unwrap", blockId: anchor.id };
      // Indentation only comes off FIRST while it is the block's own EXCESS — i.e.
      // while the block sits deeper than the visible line below it. Indentation the
      // block SHARES with the content that follows is not a thing sitting between
      // the caret and the line break above: stripping it would misalign the block
      // from its own surroundings and leave the line break — the thing the user
      // actually pointed at — still there. So the two middle rungs swap order on
      // this predicate rather than being fixed:
      //
      //   aaa            aaa            aaa            aaa
      //     bbb|    →      aaa      →     aaa     →      aaa|bbb
      //     ccc              bbb|          bbb|            ccc
      //   (same depth        ccc           ccc
      //    as ccc →        (deeper than  (now level
      //    merge)           ccc →         with ccc →
      //                     outdent)      merge)
      //
      // A block with no next visible line at all is excess-indented against the top
      // level, which is the pre-existing "peel one level per press, then merge"
      // ladder — unchanged.
      if (isIndented(node) && hasExcessIndentation(ctx, node))
        return { type: "outdent" };
      // Merge lands on the previous VISIBLE line (`applyMerge`'s own resolution),
      // so gate on that line, not the previous sibling: over a spliced multi-page
      // union it can belong to ANOTHER page (the last inner block of an expanded
      // sub-page above), and a structural merge must never span two pages. A
      // same-page TEXT-LESS line is equally unmergeable — the reducer refuses to
      // write text onto a schema that has none (a page shell row, a container
      // anchor, a divider/image/embed/file).
      const prev = prevVisibleLine(ctx.nodes, node, ctx.isAnchor);
      if (prev && prev.pageId === node.pageId && ctx.acceptsText(prev))
        return { type: "merge" };
      // There is no line break above to delete after all (a page boundary, or a
      // text-less line the reducer refuses to merge into), so non-excess
      // indentation gets its turn as the FALLBACK rung. Without this, deferring
      // outdent below merge would silently REMOVE the only way such a block can
      // escape its nesting — e.g. the line below a divider inside a container.
      if (isIndented(node)) return { type: "outdent" };
      // No same-page line to merge into: the first top-level block, or a page
      // boundary directly above. Backspace here means exactly what ArrowLeft
      // means — step backwards out to whatever caret surface precedes (the page
      // title, or a sub-page's shell row). If nothing does, the executor's nav
      // is a no-op and the keystroke is still consumed.
      return { type: "nav", dir: "left" };
    }
    case "Delete": {
      // The symmetric rung: a caret that stepped LEFT out of a run (block start,
      // `` |`zz` ``) left the delimiter ahead of it, so Delete is what removes
      // it. Same `escaped` gate, same "everything below is unchanged" property.
      const unmark = unmarkFor(caret, "after");
      if (unmark) return unmark;
      // Only a collapsed caret at the very end triggers structural intent;
      // anything else is ordinary forward text deletion (native).
      if (!caret.atEnd || !caret.collapsed) return { type: "passthrough" };
      // Delete deletes the nearest visible thing to the RIGHT of a caret at end-
      // of-line: the line break below it — so merge the next visible line up into
      // this block. Its ladder is deliberately ONE rung: the next block's marker
      // and indentation sit AFTER that break, not between it and the caret, so
      // nothing is nearer. The pulled-up line must be a same-page content line:
      // over a spliced multi-page union the next visible line can belong to
      // ANOTHER page (the outer page's next block after the last inner one), and
      // a TEXT-LESS line has nothing to pull up — the reducer refuses to merge
      // either. That second gate is `acceptsText`, not a page-row comparison:
      // the line below can equally be a container anchor (merging it away would
      // dissolve the box from one keypress) or a divider/image/embed/file, all of
      // which used to resolve to `mergeNext` and 400 at the write boundary.
      // Nothing mergeable below → step forward out of the block list (the exact
      // mirror of Backspace's `nav left`); the keystroke is still consumed even
      // when no caret surface follows.
      const next = nextVisibleLine(ctx.nodes, node, ctx.isAnchor);
      if (!next || next.pageId !== node.pageId || !ctx.acceptsText(next))
        return { type: "nav", dir: "right" };
      return { type: "mergeNext" };
    }
    case "Tab": {
      // Tab/Shift+Tab always consume the event (never move focus / insert a tab).
      if (mods.shift) {
        // Same guard as Backspace's, for the same reason: outdenting the
        // borrowed line of a CLOSED container makes it adopt the followers
        // (`outdentOne`), i.e. re-nest hidden content under the escaping block.
        const closed = collapsedAnchorAbove(ctx.nodes, node, ctx.isAnchor);
        if (closed) return { type: "expand", blockId: closed.id };
        return isIndented(node) ? { type: "outdent" } : { type: "noop" };
      }
      return hasPrevSibling(ctx.nodes, node)
        ? { type: "indent" }
        : { type: "noop" };
    }
    case "ArrowUp": {
      // Cross blocks only on the true top visual line; otherwise move within.
      if (!caret.onTopLine) return { type: "passthrough" };
      return mods.shift
        ? { type: "selectBlock", extend: "up" }
        : { type: "nav", dir: "up" };
    }
    case "ArrowDown": {
      if (!caret.onBottomLine) return { type: "passthrough" };
      return mods.shift
        ? { type: "selectBlock", extend: "down" }
        : { type: "nav", dir: "down" };
    }
    case "ArrowLeft": {
      if (mods.shift || !caret.collapsed) return { type: "passthrough" };
      // A virtual delimiter is crossed BEFORE the block edge is: at
      // `` |`zz` `` the caret is already at the block start, and stepping out of
      // the mark is what the user meant by the first press — leaving the block
      // entirely is what the second one means.
      const step = markStepFor(caret, "left");
      if (step) return step;
      const arrive = markArriveFor(caret, "left");
      if (arrive) return arrive;
      // Left at the very start crosses to the end of the previous block.
      if (!caret.atStart) return { type: "passthrough" };
      return { type: "nav", dir: "left" };
    }
    case "ArrowRight": {
      if (mods.shift || !caret.collapsed) return { type: "passthrough" };
      const step = markStepFor(caret, "right");
      if (step) return step;
      const arrive = markArriveFor(caret, "right");
      if (arrive) return arrive;
      // Right at the very end crosses to the start of the next block.
      if (!caret.atEnd) return { type: "passthrough" };
      return { type: "nav", dir: "right" };
    }
  }
}
