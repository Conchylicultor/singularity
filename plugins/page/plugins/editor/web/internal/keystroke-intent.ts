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

import { childrenOf, type BlockNode } from "../../core";
import type { CaretContext } from "./caret-geometry";

export type KeystrokeKey =
  | "Enter"
  | "Backspace"
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
  | { type: "outdent" } // backspace at start when indented, or shift+tab
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
  /** The page block id — its direct children are "top level" (not indented). */
  pageId: string;
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

/** A block is "indented" when its parent is a normal content block, not the page. */
function isIndented(node: BlockNode, pageId: string): boolean {
  return node.parentId !== null && node.parentId !== pageId;
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
        if (isIndented(node, ctx.pageId)) return { type: "outdent" };
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
      // indentation is next → outdent one level; then the line break above → merge
      // into the previous visible line; nothing left → step out (same as ArrowLeft).
      const p = ctx.editPolicy;
      if (p?.resetToOnBackspaceAtStart && node.type !== p.resetToOnBackspaceAtStart)
        return { type: "convertTo", to: p.resetToOnBackspaceAtStart };
      if (isIndented(node, ctx.pageId)) return { type: "outdent" };
      if (hasPrevSibling(ctx.nodes, node)) return { type: "merge" };
      // First block at top level: no block to merge into. Backspace here means
      // exactly what ArrowLeft means — step backwards out of the block list, into
      // whatever caret surface precedes it (the page title). If nothing does, the
      // executor's nav is a no-op and the keystroke is still consumed.
      return { type: "nav", dir: "left" };
    }
    case "Tab": {
      // Tab/Shift+Tab always consume the event (never move focus / insert a tab).
      if (mods.shift) {
        return isIndented(node, ctx.pageId) ? { type: "outdent" } : { type: "noop" };
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
