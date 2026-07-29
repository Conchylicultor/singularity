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

import {
  childrenOf,
  nextVisibleLine,
  prevVisibleLine,
  type BlockNode,
} from "../../core";
import type { CaretContext } from "./caret-geometry";

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
   * Backspace at the start of a container anchor's FIRST child: dissolve the
   * container (`blockId` is the ANCHOR's id, not the caret's block) and promote
   * its children into its slot. Not the generic `outdent` rung: `outdentOne`
   * adopts the followers, so outdenting the first child would pop it out of the
   * box AND take the rest of the container's content with it as its own
   * children — a re-nesting nobody asked for.
   */
  | { type: "unwrap"; blockId: string }
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
function firstChildAnchor(ctx: IntentContext, node: BlockNode): BlockNode | null {
  if (node.parentId === null) return null;
  const parent = ctx.nodes.find((n) => n.id === node.parentId);
  if (!parent || !ctx.isAnchor(parent)) return null;
  return childrenOf(ctx.nodes, parent.id)[0]?.id === node.id ? parent : null;
}

function hasPrevSibling(nodes: BlockNode[], node: BlockNode): boolean {
  const siblings = childrenOf(nodes, node.parentId);
  return siblings.findIndex((s) => s.id === node.id) > 0;
}

function hasExpandedChildren(nodes: BlockNode[], node: BlockNode): boolean {
  return node.expanded && childrenOf(nodes, node.id).length > 0;
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
        p?.asChild ?? (hasExpandedChildren(ctx.nodes, node) && caret.atEnd);
      // Enter at the END of a block can produce a sibling of a different type
      // (e.g. a heading yields a body paragraph). Mid-block splits keep the type.
      const siblingType = !asChild && caret.atEnd ? p?.splitInto : undefined;
      // Resolve the tail's `data` transform (e.g. a checked to-do → unchecked
      // tail) HERE, where block handles are visible. Guarded to the same-type case:
      // the tail's type is `childType` when nesting, `siblingType` when the end-
      // split swaps type, else the origin type. Running the origin's transform on a
      // tail validated against a DIFFERENT schema would corrupt it — so apply only
      // when the tail type equals the origin type.
      const tailType = asChild ? (p?.childType ?? node.type) : (siblingType ?? node.type);
      const tailData =
        p?.dataOnSplit && tailType === node.type ? p.dataOnSplit(node.data) : undefined;
      return { type: "split", position, asChild, childType: p?.childType, siblingType, tailData };
    }
    case "Backspace": {
      // Only a collapsed caret at the very start triggers structural intent;
      // anything else is ordinary text deletion (native).
      if (!caret.atStart || !caret.collapsed) return { type: "passthrough" };
      // Backspace deletes the nearest visible thing to the LEFT of the caret: a
      // type marker (bullet, checkbox, …) is visually nearest → reset the type;
      // then the enclosing structure → dissolve the container (its first child) or
      // outdent one level; then the line break above → merge into the previous
      // visible line; nothing left → step out (same as ArrowLeft).
      const p = ctx.editPolicy;
      if (p?.resetToOnBackspaceAtStart && node.type !== p.resetToOnBackspaceAtStart)
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
      const anchor = firstChildAnchor(ctx, node);
      if (anchor) return { type: "unwrap", blockId: anchor.id };
      if (isIndented(node)) return { type: "outdent" };
      // Merge lands on the previous VISIBLE line (`applyMerge`'s own resolution),
      // so gate on that line, not the previous sibling: over a spliced multi-page
      // union it can belong to ANOTHER page (the last inner block of an expanded
      // sub-page above), and a structural merge must never span two pages. A
      // same-page TEXT-LESS line is equally unmergeable — the reducer refuses to
      // write text onto a schema that has none (a page shell row, a container
      // anchor, a divider/image/embed/file).
      const prev = prevVisibleLine(ctx.nodes, node);
      if (prev && prev.pageId === node.pageId && ctx.acceptsText(prev))
        return { type: "merge" };
      // No same-page line to merge into: the first top-level block, or a page
      // boundary directly above. Backspace here means exactly what ArrowLeft
      // means — step backwards out to whatever caret surface precedes (the page
      // title, or a sub-page's shell row). If nothing does, the executor's nav
      // is a no-op and the keystroke is still consumed.
      return { type: "nav", dir: "left" };
    }
    case "Delete": {
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
      const next = nextVisibleLine(ctx.nodes, node);
      if (!next || next.pageId !== node.pageId || !ctx.acceptsText(next))
        return { type: "nav", dir: "right" };
      return { type: "mergeNext" };
    }
    case "Tab": {
      // Tab/Shift+Tab always consume the event (never move focus / insert a tab).
      if (mods.shift) {
        return isIndented(node) ? { type: "outdent" } : { type: "noop" };
      }
      return hasPrevSibling(ctx.nodes, node) ? { type: "indent" } : { type: "noop" };
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
      // Left at the very start crosses to the end of the previous block.
      if (mods.shift || !caret.collapsed || !caret.atStart) return { type: "passthrough" };
      return { type: "nav", dir: "left" };
    }
    case "ArrowRight": {
      // Right at the very end crosses to the start of the next block.
      if (mods.shift || !caret.collapsed || !caret.atEnd) return { type: "passthrough" };
      return { type: "nav", dir: "right" };
    }
  }
}
