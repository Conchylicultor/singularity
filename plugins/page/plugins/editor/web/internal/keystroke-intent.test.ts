/**
 * Pure unit tests for the single keystroke intent step (`resolveKeystroke`).
 * Run with `bun test plugins/page/plugins/editor/`.
 *
 * This module is the one place that maps (keystroke, caret, block context) → op,
 * so these tests pin every decision that used to be scattered across the keyboard
 * plugin and the block API: split-asChild, merge-vs-outdent, indent/outdent
 * boundary no-ops, and when an arrow crosses blocks vs. moves within one.
 */

import { test, expect, describe } from "bun:test";
import { Rank } from "@plugins/primitives/plugins/rank/core";
import type { BlockNode } from "../../core";
import { resolveKeystroke, type IntentContext } from "./keystroke-intent";
import type { CaretContext } from "./caret-geometry";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const PAGE = "page";
const rankA = Rank.between(null, null).toJSON();
const rankB = Rank.between(Rank.from(rankA), null).toJSON();
const rankChild = Rank.between(null, null).toJSON();

function mk(
  id: string,
  parentId: string | null,
  rank: string,
  opts: { text?: string; expanded?: boolean } = {},
): BlockNode {
  return {
    id,
    pageId: PAGE,
    parentId,
    type: "text",
    data: { text: opts.text ?? "" },
    rank,
    expanded: opts.expanded ?? false,
  };
}

/**
 * Page tree:
 *   page
 *   ├─ A ("hello", expanded, has child A1)
 *   │  └─ A1 (indented)
 *   └─ B
 */
function tree(): BlockNode[] {
  return [
    mk("A", PAGE, rankA, { text: "hello", expanded: true }),
    mk("A1", "A", rankChild),
    mk("B", PAGE, rankB),
  ];
}

function ctx(blockId: string, over: Partial<IntentContext> = {}): IntentContext {
  return { nodes: tree(), blockId, pageId: PAGE, ...over };
}

function caret(over: Partial<CaretContext> = {}): CaretContext {
  return {
    offset: 0,
    collapsed: true,
    atStart: false,
    atEnd: false,
    onTopLine: false,
    onBottomLine: false,
    caretX: 0,
    ...over,
  };
}

const NO_SHIFT = { shift: false };
const SHIFT = { shift: true };

// ---------------------------------------------------------------------------

describe("Enter", () => {
  test("shift+Enter passes through (soft newline)", () => {
    expect(resolveKeystroke("Enter", SHIFT, caret(), ctx("B"))).toEqual({
      type: "passthrough",
    });
  });

  test("split at the caret offset, asChild false by default", () => {
    expect(resolveKeystroke("Enter", NO_SHIFT, caret({ offset: 2 }), ctx("B"))).toEqual({
      type: "split",
      position: 2,
      asChild: false,
      childType: undefined,
      siblingType: undefined,
    });
  });

  test("asChild when splitting at the end of a block with expanded children", () => {
    // "hello".length === 5; A is expanded with child A1.
    const intent = resolveKeystroke("Enter", NO_SHIFT, caret({ offset: 5 }), ctx("A"));
    expect(intent).toEqual({
      type: "split",
      position: 5,
      asChild: true,
      childType: undefined,
      siblingType: undefined,
    });
  });

  test("not asChild when splitting mid-text even with children", () => {
    const intent = resolveKeystroke("Enter", NO_SHIFT, caret({ offset: 2 }), ctx("A"));
    expect(intent).toMatchObject({ type: "split", asChild: false });
  });

  test("explicit splitOptions.asChild is honored", () => {
    const intent = resolveKeystroke("Enter", NO_SHIFT, caret({ offset: 0 }), ctx("B", {
      splitOptions: { asChild: true, childType: "to-do" },
    }));
    expect(intent).toEqual({
      type: "split",
      position: 0,
      asChild: true,
      childType: "to-do",
      siblingType: undefined,
    });
  });

  test("splitInto: Enter at the END yields a sibling of that type", () => {
    // Gated on the live caret edge (caret.atEnd), not the reducer node length.
    const intent = resolveKeystroke("Enter", NO_SHIFT, caret({ atEnd: true }), ctx("B", {
      splitOptions: { splitInto: "text" },
    }));
    expect(intent).toMatchObject({ type: "split", asChild: false, siblingType: "text" });
  });

  test("splitInto: Enter MID-text keeps the type (siblingType undefined)", () => {
    // Caret not at the end → no type swap, the after-text stays the same type.
    const intent = resolveKeystroke("Enter", NO_SHIFT, caret({ offset: 2, atEnd: false }), ctx("A", {
      splitOptions: { splitInto: "text" },
    }));
    expect(intent).toMatchObject({ type: "split", asChild: false, siblingType: undefined });
  });
});

describe("Backspace", () => {
  test("not at start → passthrough (ordinary deletion)", () => {
    expect(resolveKeystroke("Backspace", NO_SHIFT, caret({ atStart: false }), ctx("B"))).toEqual({
      type: "passthrough",
    });
  });

  test("at start but a range is selected → passthrough", () => {
    expect(
      resolveKeystroke("Backspace", NO_SHIFT, caret({ atStart: true, collapsed: false }), ctx("B")),
    ).toEqual({ type: "passthrough" });
  });

  test("at start, indented → outdent", () => {
    expect(
      resolveKeystroke("Backspace", NO_SHIFT, caret({ atStart: true }), ctx("A1")),
    ).toEqual({ type: "outdent" });
  });

  test("at start, top-level with a previous sibling → merge", () => {
    expect(
      resolveKeystroke("Backspace", NO_SHIFT, caret({ atStart: true }), ctx("B")),
    ).toEqual({ type: "merge" });
  });

  test("at start, first top-level block → noop (consume, nothing before)", () => {
    expect(
      resolveKeystroke("Backspace", NO_SHIFT, caret({ atStart: true }), ctx("A")),
    ).toEqual({ type: "noop" });
  });
});

describe("Tab", () => {
  test("with a previous sibling → indent", () => {
    expect(resolveKeystroke("Tab", NO_SHIFT, caret(), ctx("B"))).toEqual({ type: "indent" });
  });

  test("first sibling (no prev) → noop (never insert a tab / move focus)", () => {
    expect(resolveKeystroke("Tab", NO_SHIFT, caret(), ctx("A"))).toEqual({ type: "noop" });
  });

  test("shift+Tab when indented → outdent", () => {
    expect(resolveKeystroke("Tab", SHIFT, caret(), ctx("A1"))).toEqual({ type: "outdent" });
  });

  test("shift+Tab at top level → noop", () => {
    expect(resolveKeystroke("Tab", SHIFT, caret(), ctx("B"))).toEqual({ type: "noop" });
  });
});

describe("ArrowUp / ArrowDown", () => {
  test("Up on the top visual line → nav up", () => {
    expect(resolveKeystroke("ArrowUp", NO_SHIFT, caret({ onTopLine: true }), ctx("B"))).toEqual({
      type: "nav",
      dir: "up",
    });
  });

  test("Up not on the top visual line → passthrough (move within block)", () => {
    expect(resolveKeystroke("ArrowUp", NO_SHIFT, caret({ onTopLine: false }), ctx("B"))).toEqual({
      type: "passthrough",
    });
  });

  test("shift+Up on the top line → block selection extending up", () => {
    expect(resolveKeystroke("ArrowUp", SHIFT, caret({ onTopLine: true }), ctx("B"))).toEqual({
      type: "selectBlock",
      extend: "up",
    });
  });

  test("Down on the bottom visual line → nav down", () => {
    expect(
      resolveKeystroke("ArrowDown", NO_SHIFT, caret({ onBottomLine: true }), ctx("A")),
    ).toEqual({ type: "nav", dir: "down" });
  });

  test("shift+Down on the bottom line → block selection extending down", () => {
    expect(
      resolveKeystroke("ArrowDown", SHIFT, caret({ onBottomLine: true }), ctx("A")),
    ).toEqual({ type: "selectBlock", extend: "down" });
  });
});

describe("ArrowLeft / ArrowRight", () => {
  test("Left at the very start → nav left (to previous block end)", () => {
    expect(
      resolveKeystroke("ArrowLeft", NO_SHIFT, caret({ atStart: true }), ctx("B")),
    ).toEqual({ type: "nav", dir: "left" });
  });

  test("Left not at start → passthrough", () => {
    expect(
      resolveKeystroke("ArrowLeft", NO_SHIFT, caret({ atStart: false }), ctx("B")),
    ).toEqual({ type: "passthrough" });
  });

  test("shift+Left → passthrough (native selection)", () => {
    expect(
      resolveKeystroke("ArrowLeft", SHIFT, caret({ atStart: true }), ctx("B")),
    ).toEqual({ type: "passthrough" });
  });

  test("Right at the very end → nav right (to next block start)", () => {
    expect(
      resolveKeystroke("ArrowRight", NO_SHIFT, caret({ atEnd: true }), ctx("A")),
    ).toEqual({ type: "nav", dir: "right" });
  });

  test("Right not at end → passthrough", () => {
    expect(
      resolveKeystroke("ArrowRight", NO_SHIFT, caret({ atEnd: false }), ctx("A")),
    ).toEqual({ type: "passthrough" });
  });
});

test("unknown block id → passthrough", () => {
  expect(resolveKeystroke("Enter", NO_SHIFT, caret(), ctx("ghost"))).toEqual({
    type: "passthrough",
  });
});
