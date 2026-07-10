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
    // A is expanded with child A1; the live caret is at the block end.
    const intent = resolveKeystroke("Enter", NO_SHIFT, caret({ offset: 5, atEnd: true }), ctx("A"));
    expect(intent).toEqual({
      type: "split",
      position: 5,
      asChild: true,
      childType: undefined,
      siblingType: undefined,
    });
  });

  test("not asChild when splitting mid-text even with children", () => {
    const intent = resolveKeystroke("Enter", NO_SHIFT, caret({ offset: 2, atEnd: false }), ctx("A"));
    expect(intent).toMatchObject({ type: "split", asChild: false });
  });

  test("asChild gates on the live caret edge, not the stale reducer text length", () => {
    // Regression: right after a markdown conversion the reducer node text lags the
    // live editor by one keystroke (node A still reads "hello", len 5), but the
    // live caret is genuinely at the end (atEnd) at a shorter offset. The nest must
    // fire off the live edge, not `offset === textLength`.
    const intent = resolveKeystroke("Enter", NO_SHIFT, caret({ offset: 2, atEnd: true }), ctx("A"));
    expect(intent).toMatchObject({ type: "split", asChild: true });
  });

  test("explicit editPolicy.asChild is honored", () => {
    const intent = resolveKeystroke("Enter", NO_SHIFT, caret({ offset: 0 }), ctx("B", {
      editPolicy: { asChild: true, childType: "to-do" },
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
      editPolicy: { splitInto: "text" },
    }));
    expect(intent).toMatchObject({ type: "split", asChild: false, siblingType: "text" });
  });

  test("splitInto: Enter MID-text keeps the type (siblingType undefined)", () => {
    // Caret not at the end → no type swap, the after-text stays the same type.
    const intent = resolveKeystroke("Enter", NO_SHIFT, caret({ offset: 2, atEnd: false }), ctx("A", {
      editPolicy: { splitInto: "text" },
    }));
    expect(intent).toMatchObject({ type: "split", asChild: false, siblingType: undefined });
  });

  test("empty block with breakOutOnEmptyEnter → convertTo (exits the list)", () => {
    // An empty bullet (type "bulleted-list") breaks out to "text" instead of
    // spawning another empty bullet.
    const nodes: BlockNode[] = [
      { ...mk("B", PAGE, rankB, { text: "" }), type: "bulleted-list" },
    ];
    // Empty == the live caret sits at both the start and the end of the block.
    const intent = resolveKeystroke("Enter", NO_SHIFT, caret({ atStart: true, atEnd: true }), {
      nodes,
      blockId: "B",
      pageId: PAGE,
      editPolicy: { breakOutOnEmptyEnter: "text" },
    });
    expect(intent).toEqual({ type: "convertTo", to: "text" });
  });

  test("non-empty block with breakOutOnEmptyEnter → split (no break-out)", () => {
    // A has text "hello" — Enter still splits despite the break-out policy.
    const intent = resolveKeystroke("Enter", NO_SHIFT, caret({ offset: 2 }), ctx("A", {
      editPolicy: { breakOutOnEmptyEnter: "text" },
    }));
    expect(intent).toMatchObject({ type: "split", position: 2, asChild: false });
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

  test("at start, formatted block (type !== reset target) → convertTo (reset before merge)", () => {
    // A bulleted item B (type "bulleted-list") at top level resets to "text"
    // first; a SECOND Backspace would then merge.
    const nodes: BlockNode[] = [
      mk("A", PAGE, rankA, { text: "hello" }),
      { ...mk("B", PAGE, rankB), type: "bulleted-list" },
    ];
    expect(
      resolveKeystroke("Backspace", NO_SHIFT, caret({ atStart: true }), {
        nodes,
        blockId: "B",
        pageId: PAGE,
        editPolicy: { resetToOnBackspaceAtStart: "text" },
      }),
    ).toEqual({ type: "convertTo", to: "text" });
  });

  test("at start, already the reset target type → merge (no reset)", () => {
    // B is already "text"; the reset policy is a no-op, so Backspace merges.
    expect(
      resolveKeystroke("Backspace", NO_SHIFT, caret({ atStart: true }), ctx("B", {
        editPolicy: { resetToOnBackspaceAtStart: "text" },
      })),
    ).toEqual({ type: "merge" });
  });

  test("at start, indented formatted block → still outdent first (before reset)", () => {
    // A1 is indented under A and formatted; outdent takes precedence over reset.
    const nodes: BlockNode[] = [
      mk("A", PAGE, rankA, { text: "hello", expanded: true }),
      { ...mk("A1", "A", rankChild), type: "bulleted-list" },
      mk("B", PAGE, rankB),
    ];
    expect(
      resolveKeystroke("Backspace", NO_SHIFT, caret({ atStart: true }), {
        nodes,
        blockId: "A1",
        pageId: PAGE,
        editPolicy: { resetToOnBackspaceAtStart: "text" },
      }),
    ).toEqual({ type: "outdent" });
  });

  test("at start, first top-level block → nav left (out to the preceding surface)", () => {
    expect(
      resolveKeystroke("Backspace", NO_SHIFT, caret({ atStart: true }), ctx("A")),
    ).toEqual({ type: "nav", dir: "left" });
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
