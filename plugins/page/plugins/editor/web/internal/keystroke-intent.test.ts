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
import { applyBlockOp, nextVisibleLine, type BlockNode } from "../../core";
import { resolveKeystroke, type IntentContext, type KeystrokeKey } from "./keystroke-intent";
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
      tailData: undefined,
    });
  });

  test("Enter at start of a NON-EMPTY block still resolves to a plain position-0 split", () => {
    // Identity preservation (insert empty ABOVE, keep the origin) is decided
    // DOWNSTREAM in the reducer/executor from `position === 0 && afterRuns.length > 0`.
    // The resolver stays oblivious: A has text "hello", caret at the very start
    // (atStart, not atEnd) → an ordinary split at position 0, not asChild.
    const intent = resolveKeystroke("Enter", NO_SHIFT, caret({ offset: 0, atStart: true }), ctx("A"));
    expect(intent).toEqual({
      type: "split",
      position: 0,
      asChild: false,
      childType: undefined,
      siblingType: undefined,
      tailData: undefined,
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
      tailData: undefined,
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
      tailData: undefined,
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

  // Empty-Enter escape ladder: indentation first (outdent, keeping the type),
  // then the type (convertTo), then ordinary split — the OPPOSITE order to
  // Backspace's marker-first reset.
  test("empty-Enter: indented block with breakout policy → outdent (keep type)", () => {
    // An empty bullet indented under A escapes nesting outward before its type.
    const nodes: BlockNode[] = [
      mk("A", PAGE, rankA, { text: "hello", expanded: true }),
      { ...mk("A1", "A", rankChild, { text: "" }), type: "bulleted-list" },
      mk("B", PAGE, rankB),
    ];
    const intent = resolveKeystroke("Enter", NO_SHIFT, caret({ atStart: true, atEnd: true }), {
      nodes,
      blockId: "A1",
      pageId: PAGE,
      editPolicy: { breakOutOnEmptyEnter: "text" },
    });
    expect(intent).toEqual({ type: "outdent" });
  });

  test("empty-Enter: indented block already the target type → still outdent", () => {
    // A1 (default tree) is indented and already "text"; empty-Enter still escapes
    // nesting first — outdent takes precedence over the (satisfied) type escape.
    const intent = resolveKeystroke("Enter", NO_SHIFT, caret({ atStart: true, atEnd: true }), ctx("A1", {
      editPolicy: { breakOutOnEmptyEnter: "text" },
    }));
    expect(intent).toEqual({ type: "outdent" });
  });

  test("empty-Enter: top-level, already the target type → falls through to split", () => {
    // B is top-level and already "text"; no level left to escape → ordinary split.
    const intent = resolveKeystroke("Enter", NO_SHIFT, caret({ atStart: true, atEnd: true }), ctx("B", {
      editPolicy: { breakOutOnEmptyEnter: "text" },
    }));
    expect(intent).toMatchObject({ type: "split", asChild: false });
  });

  test("empty-Enter: indented plain block WITHOUT breakout policy → split", () => {
    // No breakout policy → the empty-Enter ladder never engages; ordinary split.
    const intent = resolveKeystroke("Enter", NO_SHIFT, caret({ atStart: true, atEnd: true }), ctx("A1"));
    expect(intent).toMatchObject({ type: "split", asChild: false });
  });

  // dataOnSplit resolver: the tail's data transform is applied ONLY when the tail
  // block's type equals the origin's — a type-swapping split (siblingType /
  // differing childType) must not run the origin's transform on the other schema.
  test("tailData: applied on a same-type split (mid-text)", () => {
    const nodes: BlockNode[] = [
      { ...mk("B", PAGE, rankB, { text: "abc" }), type: "to-do", data: { text: "abc", checked: true } },
    ];
    const intent = resolveKeystroke("Enter", NO_SHIFT, caret({ offset: 1, atEnd: false }), {
      nodes,
      blockId: "B",
      pageId: PAGE,
      editPolicy: { dataOnSplit: (d) => ({ ...(d as object), checked: false }) },
    });
    expect(intent).toMatchObject({ type: "split", tailData: { text: "abc", checked: false } });
  });

  test("tailData: NOT applied when the end-split swaps sibling type", () => {
    const nodes: BlockNode[] = [
      { ...mk("B", PAGE, rankB, { text: "abc" }), type: "heading-1", data: { text: "abc" } },
    ];
    const intent = resolveKeystroke("Enter", NO_SHIFT, caret({ atEnd: true }), {
      nodes,
      blockId: "B",
      pageId: PAGE,
      editPolicy: { splitInto: "text", dataOnSplit: (d) => ({ ...(d as object), swapped: true }) },
    });
    expect(intent).toMatchObject({ type: "split", siblingType: "text", tailData: undefined });
  });

  test("tailData: NOT applied when nesting as a child of a different type", () => {
    const nodes: BlockNode[] = [
      { ...mk("B", PAGE, rankB, { text: "abc" }), type: "toggle", data: { text: "abc" } },
    ];
    const intent = resolveKeystroke("Enter", NO_SHIFT, caret({ atEnd: true }), {
      nodes,
      blockId: "B",
      pageId: PAGE,
      editPolicy: { asChild: true, childType: "text", dataOnSplit: (d) => ({ ...(d as object), swapped: true }) },
    });
    expect(intent).toMatchObject({ type: "split", asChild: true, childType: "text", tailData: undefined });
  });

  test("tailData: applied when nesting as a child WITHOUT an explicit childType", () => {
    // Tail type defaults to the origin type when childType is absent → applied.
    const nodes: BlockNode[] = [
      { ...mk("B", PAGE, rankB, { text: "abc" }), type: "to-do", data: { text: "abc", checked: true } },
    ];
    const intent = resolveKeystroke("Enter", NO_SHIFT, caret({ atEnd: true }), {
      nodes,
      blockId: "B",
      pageId: PAGE,
      editPolicy: { asChild: true, dataOnSplit: (d) => ({ ...(d as object), checked: false }) },
    });
    expect(intent).toMatchObject({ type: "split", asChild: true, tailData: { text: "abc", checked: false } });
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

  test("at start, indented formatted block → convertTo (marker strips before indentation)", () => {
    // A1 is indented under A and formatted. The marker (bullet) is visually nearest
    // the caret, so it strips BEFORE the indentation — reset wins over outdent.
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
    ).toEqual({ type: "convertTo", to: "text" });
  });

  test("at start, indented + already the reset target type → outdent (no reset needed)", () => {
    // A1 (default tree) is indented and already "text": the reset policy is
    // satisfied (type === target), so the ladder falls to outdent.
    expect(
      resolveKeystroke("Backspace", NO_SHIFT, caret({ atStart: true }), ctx("A1", {
        editPolicy: { resetToOnBackspaceAtStart: "text" },
      })),
    ).toEqual({ type: "outdent" });
  });

  test("at start, first top-level block → nav left (out to the preceding surface)", () => {
    expect(
      resolveKeystroke("Backspace", NO_SHIFT, caret({ atStart: true }), ctx("A")),
    ).toEqual({ type: "nav", dir: "left" });
  });
});

describe("Delete", () => {
  test("not at end → passthrough (ordinary forward deletion)", () => {
    expect(resolveKeystroke("Delete", NO_SHIFT, caret({ atEnd: false }), ctx("A"))).toEqual({
      type: "passthrough",
    });
  });

  test("at end but a range is selected → passthrough", () => {
    expect(
      resolveKeystroke("Delete", NO_SHIFT, caret({ atEnd: true, collapsed: false }), ctx("A")),
    ).toEqual({ type: "passthrough" });
  });

  test("at end with a next visible line → mergeNext (pull the next line up)", () => {
    // A is expanded with child A1, so the visible line directly below A is A1.
    expect(
      resolveKeystroke("Delete", NO_SHIFT, caret({ atEnd: true }), ctx("A")),
    ).toEqual({ type: "mergeNext" });
  });

  test("at end of the LAST visible line → nav right (out to the following surface)", () => {
    // B is the last visible line; nothing follows it anywhere up the tree, so
    // Delete resolves to `nav right` — the exact mirror of Backspace's `nav left`.
    expect(
      resolveKeystroke("Delete", NO_SHIFT, caret({ atEnd: true }), ctx("B")),
    ).toEqual({ type: "nav", dir: "right" });
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

// ---------------------------------------------------------------------------
// Trajectories: repeated presses of the SAME key, evolving the fixture between
// each press exactly as the executor would. Each ladder strips one structural
// level per press until it reaches a terminal intent (merge / split), so the
// SEQUENCE of intents is the observable contract, not any single decision.
// ---------------------------------------------------------------------------

/**
 * Drive one key repeatedly against `blockId`, applying the reducer effect of each
 * non-terminal intent (outdent via `applyBlockOp`; convertTo as a type swap) and
 * re-resolving, until a terminal intent (merge / split / nav / noop). Returns the
 * ordered list of intent types.
 */
function runTrajectory(
  initial: BlockNode[],
  blockId: string,
  key: KeystrokeKey,
  editPolicy: IntentContext["editPolicy"],
  caretOver: Partial<CaretContext>,
): string[] {
  let nodes = initial;
  const seq: string[] = [];
  for (let guard = 0; guard < 10; guard++) {
    const intent = resolveKeystroke(key, NO_SHIFT, caret(caretOver), {
      nodes,
      blockId,
      pageId: PAGE,
      editPolicy,
    });
    seq.push(intent.type);
    if (intent.type === "outdent") {
      nodes = applyBlockOp(nodes, { kind: "outdent", blockIds: [blockId] });
    } else if (intent.type === "convertTo") {
      nodes = nodes.map((n) => (n.id === blockId ? { ...n, type: intent.to } : n));
    } else if (intent.type === "mergeNext") {
      // Delete pulls the NEXT visible line up: the executor merges that line into
      // `blockId`, so mirror it here by merging `nextVisibleLine(blockId)` away.
      const node = nodes.find((n) => n.id === blockId)!;
      const next = nextVisibleLine(nodes, node);
      if (!next) break; // unreachable: mergeNext implies a next line exists
      nodes = applyBlockOp(nodes, { kind: "merge", blockId: next.id });
    } else {
      break; // merge / split / nav / noop — a trajectory ends here
    }
  }
  return seq;
}

describe("trajectories", () => {
  test("Backspace: formatted nested block → [convertTo, outdent, merge]", () => {
    // page ▸ A ▸ X(bulleted-list, indented). Marker strips, then indentation,
    // then the line break above (X lands after A, so merge has a prev sibling).
    const nodes: BlockNode[] = [
      mk("A", PAGE, rankA, { text: "hello", expanded: true }),
      { ...mk("X", "A", rankChild, { text: "item" }), type: "bulleted-list" },
    ];
    expect(
      runTrajectory(nodes, "X", "Backspace", { resetToOnBackspaceAtStart: "text" }, { atStart: true }),
    ).toEqual(["convertTo", "outdent", "merge"]);
  });

  test("Backspace: plain block nested two deep → [outdent, outdent, merge]", () => {
    // page ▸ A ▸ B ▸ X(text). No marker to strip; two levels of indentation peel
    // off, then merge into the previous visible line.
    const rankB2 = Rank.between(null, null).toJSON();
    const nodes: BlockNode[] = [
      mk("A", PAGE, rankA, { text: "a", expanded: true }),
      mk("B", "A", rankB2, { text: "b", expanded: true }),
      mk("X", "B", rankChild, { text: "x" }),
    ];
    expect(runTrajectory(nodes, "X", "Backspace", undefined, { atStart: true })).toEqual([
      "outdent",
      "outdent",
      "merge",
    ]);
  });

  test("empty-Enter: empty bullet nested two deep → [outdent, outdent, convertTo, split]", () => {
    // page ▸ A ▸ B ▸ X(empty bulleted-list, breakout policy). Nesting escapes
    // outward twice, THEN the type escapes (convertTo), THEN ordinary split.
    const rankB2 = Rank.between(null, null).toJSON();
    const nodes: BlockNode[] = [
      mk("A", PAGE, rankA, { text: "a", expanded: true }),
      mk("B", "A", rankB2, { text: "b", expanded: true }),
      { ...mk("X", "B", rankChild, { text: "" }), type: "bulleted-list" },
    ];
    expect(
      runTrajectory(nodes, "X", "Enter", { breakOutOnEmptyEnter: "text" }, { atStart: true, atEnd: true }),
    ).toEqual(["outdent", "outdent", "convertTo", "split"]);
  });

  test("empty-Enter: empty indented plain block without policy → [split]", () => {
    // No breakout policy → the ladder never engages; the first press already splits.
    const nodes: BlockNode[] = [
      mk("A", PAGE, rankA, { text: "a", expanded: true }),
      mk("X", "A", rankChild, { text: "" }),
    ];
    expect(runTrajectory(nodes, "X", "Enter", undefined, { atStart: true, atEnd: true })).toEqual([
      "split",
    ]);
  });

  test("Delete: repeated at the end of a block with a subtree flattens it one line per press → [mergeNext, mergeNext, nav]", () => {
    // page ▸ P (expanded, ├ C1 └ C2). Delete at the end of P pulls each next
    // visible line up in turn; once P is the only line left it steps out (nav).
    const c1 = Rank.between(null, null).toJSON();
    const c2 = Rank.between(Rank.from(c1), null).toJSON();
    const nodes: BlockNode[] = [
      mk("P", PAGE, rankA, { text: "p", expanded: true }),
      mk("C1", "P", c1, { text: "c1" }),
      mk("C2", "P", c2, { text: "c2" }),
    ];
    expect(runTrajectory(nodes, "P", "Delete", undefined, { atEnd: true })).toEqual([
      "mergeNext",
      "mergeNext",
      "nav",
    ]);
  });
});

test("unknown block id → passthrough", () => {
  expect(resolveKeystroke("Enter", NO_SHIFT, caret(), ctx("ghost"))).toEqual({
    type: "passthrough",
  });
});
