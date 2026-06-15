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
  | { type: "split"; position: number; asChild: boolean; childType?: string; siblingType?: string }
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
  /** Contributor split overrides (e.g. nest the split-off content as a child). */
  splitOptions?: { asChild?: boolean; childType?: string; splitInto?: string };
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
      const position = caret.offset;
      // Every "is the caret at the end of the block?" decision gates on the live
      // caret edge (`caret.atEnd`), never the reducer node length: the latter lags
      // a just-applied markdown conversion (`### ` → heading) by one keystroke,
      // which would make the very next Enter miss the type swap or the nest.
      //
      // Honor an explicit contributor `asChild`; otherwise nest the split-off
      // content as the first child only when splitting at the very end of a block
      // that has visible children (Notion's Enter-at-end behavior).
      const asChild =
        ctx.splitOptions?.asChild ??
        (hasExpandedChildren(ctx.nodes, node) && caret.atEnd);
      // Enter at the END of a block can produce a sibling of a different type
      // (e.g. a heading yields a body paragraph). Mid-block splits keep the type.
      const siblingType =
        !asChild && caret.atEnd ? ctx.splitOptions?.splitInto : undefined;
      return {
        type: "split",
        position,
        asChild,
        childType: ctx.splitOptions?.childType,
        siblingType,
      };
    }
    case "Backspace": {
      // Only a collapsed caret at the very start triggers structural intent;
      // anything else is ordinary text deletion (native).
      if (!caret.atStart || !caret.collapsed) return { type: "passthrough" };
      if (isIndented(node, ctx.pageId)) return { type: "outdent" };
      if (hasPrevSibling(ctx.nodes, node)) return { type: "merge" };
      // First block at top level: nothing before the caret — consume.
      return { type: "noop" };
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
