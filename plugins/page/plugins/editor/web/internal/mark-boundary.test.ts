/**
 * Pure unit tests for the mark-boundary model.
 * Run with `bun test plugins/page/plugins/editor/`.
 *
 * The load-bearing claim is the rule in `mark-boundary.ts`'s header: a boundary
 * has TWO caret states — the left run's marks and the right run's — the browser
 * hands you `natural`, and the virtual stop is **the other one**. These specs pin
 * that as a selection between the two sides, not as arithmetic over them; the
 * `not L ∩ R` describe below is there because `left ∩ right` was the rule this
 * module originally stated, and it agrees with the real one on every boundary
 * whose stop-side marks are a subset of `natural`'s — which is every block edge,
 * i.e. every case the first round of tests covered.
 */

import { test, expect, describe } from "bun:test";
import type { Mark } from "../../core";
import { delimiterDeletion, virtualStop, type MarkBoundary } from "./mark-boundary";

/** A block edge is modelled as an empty unmarked neighbour — hence the `[]` defaults. */
function boundary(over: Partial<MarkBoundary> = {}): MarkBoundary {
  return { left: [], right: [], natural: [], ...over };
}

const code: Mark[] = ["code"];
const bold: Mark[] = ["bold"];

describe("the stop is the state `natural` is NOT", () => {
  test("`zz`| at the END of a block → the RIGHT state ({}), crossed by ArrowRight", () => {
    // The right neighbour is the void after the last leaf. The caret's anchor is
    // the code node's own end, so the unmarked position simply does not exist.
    const b = boundary({ left: code, right: [], natural: code });
    expect(virtualStop(b)).toEqual({ direction: "right", marks: [] });
  });

  test("|`zz` at the START of a block → the LEFT state ({}), crossed by ArrowLeft", () => {
    const b = boundary({ left: [], right: code, natural: code });
    expect(virtualStop(b)).toEqual({ direction: "left", marks: [] });
  });

  test("`zz`|plain MID-block → the RIGHT state ({}), the browser having anchored LEFT", () => {
    // MEASURED (e2e phase 6): Chromium resolves a text/text seam to the END of
    // the earlier run, so `natural` is the code run's marks and the missing
    // state is the plain one.
    const b = boundary({ left: code, right: [], natural: code });
    expect(virtualStop(b)).toEqual({ direction: "right", marks: [] });
  });

  test("plain|`zz` MID-block → the RIGHT state ({code}) — you can prepend INTO the span", () => {
    // The mirror of the block-END bug, and the row `left ∩ right` gets wrong: it
    // computes "the missing state is {}, which `natural` already has", i.e. NO
    // stop — so the caret could never sit inside a code run at its start.
    const b = boundary({ left: [], right: code, natural: [] });
    expect(virtualStop(b)).toEqual({ direction: "right", marks: ["code"] });
  });

  test("**a**|`b` MID-block → the RIGHT state ({code}), not 'outside both'", () => {
    // One press crosses the WHOLE boundary (cap 1), so it lands in the right
    // run's state rather than in a third, mark-less one that no run carries.
    const b = boundary({ left: bold, right: code, natural: bold });
    expect(virtualStop(b)).toEqual({ direction: "right", marks: ["code"] });
  });

  test("`b`|**a** MID-block, anchored RIGHT → the LEFT state ({code})", () => {
    const b = boundary({ left: code, right: bold, natural: bold });
    expect(virtualStop(b)).toEqual({ direction: "left", marks: ["code"] });
  });
});

describe("the rule is a SELECTION between the two sides, not `left ∩ right`", () => {
  /**
   * Stated as the rule itself, over every boundary whose anchor belongs to a
   * side: the stop's marks are the OTHER side's, whatever `left ∩ right` says.
   */
  const cases: {
    name: string;
    b: MarkBoundary;
    /** Which side the browser anchored on — i.e. which side `natural` IS. */
    anchored: "left" | "right";
    /** What the retired `left ∩ right` rule computed for the same boundary. */
    intersection: Mark[];
  }[] = [
    {
      name: "block end (the two agree)",
      b: boundary({ left: code, right: [], natural: code }),
      anchored: "left",
      intersection: [],
    },
    {
      name: "a marked run on the RIGHT of a seam (they do not)",
      b: boundary({ left: [], right: code, natural: [] }),
      anchored: "left",
      intersection: [],
    },
    {
      name: "two disjoint marks (they do not)",
      b: boundary({ left: bold, right: code, natural: bold }),
      anchored: "left",
      intersection: [],
    },
    {
      name: "a shared mark, the right side adding one (they do not)",
      b: boundary({ left: bold, right: ["bold", "code"], natural: bold }),
      anchored: "left",
      intersection: bold,
    },
    {
      name: "block start (the two agree)",
      b: boundary({ left: [], right: code, natural: code }),
      anchored: "right",
      intersection: [],
    },
    {
      name: "a marked run on the LEFT of a right-anchored seam (they do not)",
      b: boundary({ left: code, right: bold, natural: bold }),
      anchored: "right",
      intersection: [],
    },
  ];

  for (const { name, b, anchored, intersection } of cases) {
    test(name, () => {
      const stop = virtualStop(b);
      const other = anchored === "left" ? b.right : b.left;
      expect(stop).not.toBeNull();
      // THE RULE. Nothing here mentions ∩ — that is the point.
      expect(stop?.marks).toEqual(other);
      expect(stop?.direction).toBe(anchored === "left" ? "right" : "left");
      // ...and the old rule, recorded so the rows where it coincides are visibly
      // coincidence rather than agreement.
      if (JSON.stringify(other) !== JSON.stringify(intersection)) {
        expect(stop?.marks).not.toEqual(intersection);
      }
    });
  }

  test("a nested span's inner boundary is reachable in BOTH directions", () => {
    // `**a**|**`b`**` — both sides bold, the right adds code. `L ∩ R = {bold}`,
    // which the anchor already carries, so the old rule synthesized nothing and
    // the caret could not stand inside the code span at its start.
    const anchoredLeft = boundary({ left: bold, right: ["bold", "code"], natural: bold });
    expect(virtualStop(anchoredLeft)).toEqual({
      direction: "right",
      marks: ["bold", "code"],
    });
    const anchoredRight = boundary({
      left: bold,
      right: ["bold", "code"],
      natural: ["bold", "code"],
    });
    expect(virtualStop(anchoredRight)).toEqual({ direction: "left", marks: ["bold"] });
  });
});

describe("boundaries with no stop", () => {
  test("two runs with the same marks are not a boundary at all", () => {
    // `coalesce` splits on colour and link too, so this pair is reachable.
    expect(virtualStop(boundary({ left: bold, right: bold, natural: bold }))).toBeNull();
  });

  test("plain text mid-run needs no stop", () => {
    expect(virtualStop(boundary())).toBeNull();
  });

  test("an ELEMENT anchor belongs to neither side → no stop", () => {
    // `natural` is `[]` for an element-typed anchor (a caret beside an inline
    // decorator) while the runs around it are marked: there is no run the caret
    // has stepped out of, so there is no delimiter it could have crossed.
    expect(virtualStop(boundary({ left: bold, right: code, natural: [] }))).toBeNull();
  });
});

describe("deleting the delimiter", () => {
  test("a block edge: the marked run's own marks come off, nothing is left", () => {
    expect(delimiterDeletion(boundary({ left: code, right: [], natural: code }))).toEqual({
      before: ["code"],
      after: [],
      residual: [],
    });
  });

  test("a marked run on the RIGHT strips FORWARD — the side a one-way walk missed", () => {
    expect(delimiterDeletion(boundary({ left: [], right: code, natural: [] }))).toEqual({
      before: [],
      after: ["code"],
      residual: [],
    });
  });

  test("a disjoint seam loses BOTH sides' marks — one press deletes the whole boundary", () => {
    expect(delimiterDeletion(boundary({ left: bold, right: code, natural: bold }))).toEqual({
      before: ["bold"],
      after: ["code"],
      residual: [],
    });
  });

  test("a shared mark SURVIVES, and is the caret's state afterwards", () => {
    const b = boundary({ left: bold, right: ["bold", "code"], natural: bold });
    expect(delimiterDeletion(b)).toEqual({
      before: [],
      after: ["code"],
      residual: ["bold"],
    });
  });

  test("two identical runs carry no delimiter", () => {
    expect(delimiterDeletion(boundary({ left: bold, right: bold, natural: bold }))).toEqual({
      before: [],
      after: [],
      residual: ["bold"],
    });
  });

  test("every field stays in MARK_ORDER, whatever the input order", () => {
    // MARK_ORDER is bold, italic, underline, strikethrough, code — so equality is
    // a plain array compare everywhere else.
    const b = boundary({
      left: ["code", "bold", "italic"],
      right: ["strikethrough", "italic"],
      natural: ["italic", "code", "bold"],
    });
    expect(delimiterDeletion(b)).toEqual({
      before: ["bold", "code"],
      after: ["strikethrough"],
      residual: ["italic"],
    });
    expect(virtualStop(b)?.marks).toEqual(["italic", "strikethrough"]);
  });
});

describe("the boundary reads identically at depth 0 and depth 1", () => {
  test("stepping across the delimiter cannot change the answer", () => {
    // Nothing here reads `selection.format`, so the SAME boundary object is what
    // the caret sees before and after the step. That is what lets the step back
    // in — and Backspace's rung — re-derive the direction the step out used.
    const b = boundary({ left: code, right: [], natural: code });
    expect(virtualStop(b)).toEqual(virtualStop(b));
  });
});
