import { describe, expect, test } from "bun:test";
import { Rank } from "@plugins/primitives/plugins/rank/core";
import { buildTree } from "@plugins/primitives/plugins/tree/core";
import type { Block, BlockHandle } from "../../core";
import { computeFrameSpans } from "./block-frames";
import { flattenVisible } from "./flatten-blocks";
import { BLOCK_INDENT, FRAME_PAD_X, blockContentLeft } from "./page-column";
import {
  resolveFramePadInsets,
  resolveRailSeats,
  type RailSeat,
} from "./rail-seat";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ANCHOR = "container";
const RULE = "rule-container"; // a container that paints a bar, not a filled box
const GLYPH = "glyph-container"; // a filled box whose gutter glyph holds the column
const TOGGLE = "toggle"; // a `collapsible: "always"` type, whose chevron is its own
const HEADING = "heading"; // a type whose first line is taller than the body default

function handleOf(type: string): BlockHandle<unknown> | undefined {
  if (type === ANCHOR || type === RULE || type === GLYPH)
    return { type, anchor: true } as unknown as BlockHandle<unknown>;
  if (type === TOGGLE)
    return { type, collapsible: "always" } as unknown as BlockHandle<unknown>;
  if (type === HEADING)
    return { type, textVariant: "heading" } as unknown as BlockHandle<unknown>;
  return { type } as unknown as BlockHandle<unknown>;
}

const anchorTypes = new Set([ANCHOR, RULE, GLYPH]);
/** A container is a container because it contributes a FRAME — same set here. */
const framedTypes = new Set([ANCHOR, RULE, GLYPH]);
/** `RULE` paints a bar, so it clears nothing; the other two paint filled boxes. */
const padsBox = (type: string) => type === ANCHOR || type === GLYPH;
/**
 * …but only `ANCHOR` may reclaim its children's indent step. `GLYPH` draws in
 * exactly that column (the callout's icon), so it pads without absorbing.
 */
const absorbsIndent = (type: string) => type === ANCHOR;

/** The vertical seat a row with no `gutterFirstLineCenter` override resolves to. */
const bodyCenter = "calc(var(--space-xs) + var(--doc-lh-body) / 2)";
const headingCenter = "calc(var(--space-xs) + var(--doc-lh-heading) / 2)";

let rankSeq = 0;
function row(
  id: string,
  parentId: string | null,
  opts: { type?: string; expanded?: boolean } = {},
): Block {
  rankSeq += 1;
  return {
    id,
    pageId: "p",
    parentId,
    type: opts.type ?? "text",
    data: { text: [] },
    // Zero-padded so the ranks stay lexicographically monotonic past base-36
    // digit 35 — `Rank` compares as TEXT, so an unpadded counter starts ordering
    // "a10" before "a9" and the fixture silently stops meaning what it reads as.
    rank: Rank.from(`a${rankSeq.toString(36).padStart(4, "0")}`).toJSON(),
    expanded: opts.expanded ?? true,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as unknown as Block;
}

/** Rows in the order the fixture declares them, ranked to match that order. */
function forest(...rows: Block[]): Block[] {
  return rows;
}

/** What the real caller does before `buildTree` (`block-editor.tsx`). */
function sortByRank(rows: Block[]): Block[] {
  return [...rows].sort((a, b) => Rank.compare(a.rank, b.rank));
}

/** The full pipeline a row goes through in the editor, seats included. */
function seats(rows: Block[]): RailSeat[] {
  const flat = flattenVisible(buildTree(sortByRank(rows)), anchorTypes);
  return resolveRailSeats(
    flat,
    computeFrameSpans(flat, framedTypes),
    handleOf,
    padsBox,
    absorbsIndent,
  );
}

/** Which block each row's rail acts on, as ids — the whole point of the seat. */
function owners(rows: Block[]): string[] {
  return seats(rows).map((s) => s.owner.block.id);
}

// ---------------------------------------------------------------------------
// `owner` — the BORROW-CHAIN rule
// ---------------------------------------------------------------------------

describe("resolveRailSeats — owner: only the borrowed LINE transfers ownership", () => {
  test("the borrowed line's rail acts on the CONTAINER, not on the line's own block", () => {
    const rows = forest(
      row("A", null, { type: ANCHOR }),
      row("C1", "A"),
      row("C2", "A"),
    );
    const out = seats(rows);
    expect(out[1]!.owner.block.id).toBe("A");
    // `childCount` rides along so a consumer can offer a fold without a lookup.
    expect(out[1]!.owner.childCount).toBe(2);
  });

  test("lines 2..n inside the box own THEMSELVES — the distinction the span rule loses", () => {
    // This is the rule that makes the refactor worth doing. C2 sits inside the
    // callout's frame exactly as C1 does, so the SPAN rule seats both rails at
    // the same x. But only C1 is the container's borrowed line: C2 is a child,
    // and its `+` / drag / menu must keep acting on C2.
    const rows = forest(
      row("A", null, { type: ANCHOR }),
      row("C1", "A"),
      row("C2", "A"),
      row("C3", "A"),
    );
    expect(owners(rows)).toEqual(["A", "A", "C2", "C3"]);
  });

  test("nested containers sharing one borrowed line: the OUTERMOST owns it", () => {
    // A renders no line and B renders no line, so the single line on screen is
    // G1's — borrowed up the whole chain. Dragging it must move the outer box.
    const rows = forest(
      row("A", null, { type: ANCHOR }),
      row("B", "A", { type: ANCHOR }),
      row("G1", "B"),
      row("G2", "B"),
      row("C2", "A"),
    );
    const out = seats(rows);
    expect(out[2]!.owner.block.id).toBe("A");
    expect(out[3]!.owner.block.id).toBe("G2"); // line 2 of the inner box: itself
    expect(out[4]!.owner.block.id).toBe("C2");
  });

  test("the chain breaks at the first row that is a following SIBLING, not a first child", () => {
    // K is A's second child, so the anchor immediately above it in the flatten
    // is not one whose line it borrows — the depth step is what says so.
    const rows = forest(
      row("A", null, { type: ANCHOR }),
      row("C1", "A"),
      row("C1a", "C1"),
      row("K", "A"),
    );
    expect(owners(rows)).toEqual(["A", "A", "C1a", "K"]);
  });

  test("an anchor row owns itself: it renders no line, so no line can be borrowed FROM it", () => {
    const rows = forest(
      row("A", null, { type: ANCHOR }),
      row("B", "A", { type: ANCHOR }),
      row("G1", "B"),
    );
    const out = seats(rows);
    expect(out[0]!.owner.block.id).toBe("A");
    expect(out[1]!.owner.block.id).toBe("B");
  });

  test("a row after the box is untouched by the container that precedes it", () => {
    const rows = forest(
      row("A", null, { type: ANCHOR }),
      row("C1", "A"),
      row("AFTER", null),
    );
    expect(owners(rows)).toEqual(["A", "A", "AFTER"]);
  });
});

// ---------------------------------------------------------------------------
// `left` — the SPAN rule, and its independence from `owner`
// ---------------------------------------------------------------------------

describe("resolveRailSeats — left: the span rule is NOT the borrow rule", () => {
  test("a framed row that is not the borrowed line seats at the FRAME's edge while owning itself", () => {
    // Both halves asserted together on one row, deliberately: conflating them is
    // the bug this module exists to kill. C2 is inside the frame (so its rail
    // hangs off the container's edge, leaving the decoration column free) and is
    // NOT the borrowed line (so its rail acts on C2).
    const rows = forest(
      row("A", null, { type: ANCHOR }),
      row("C1", "A"),
      row("C2", "A"),
    );
    const seat = seats(rows)[2]!;
    expect(seat.left).toBe(blockContentLeft(0)); // the frame's edge, not depth 1
    expect(seat.left).not.toBe(blockContentLeft(1));
    expect(seat.owner.block.id).toBe("C2");
  });

  test("an unframed row seats at its OWN content edge and owns itself", () => {
    const rows = forest(row("P", null), row("K", "P"), row("Q", null));
    const out = seats(rows);
    expect(out.map((s) => s.left)).toEqual([
      blockContentLeft(0),
      blockContentLeft(1),
      blockContentLeft(0),
    ]);
    expect(out.map((s) => s.owner.block.id)).toEqual(["P", "K", "Q"]);
  });

  test("nested frames all seat at the OUTERMOST frame's edge", () => {
    const rows = forest(
      row("A", null, { type: ANCHOR }),
      row("B", "A", { type: ANCHOR }),
      row("G1", "B"),
      row("C2", "A"),
    );
    expect(seats(rows).map((s) => s.left)).toEqual([
      blockContentLeft(0),
      blockContentLeft(0),
      blockContentLeft(0),
      blockContentLeft(0),
    ]);
  });

  test("a container nested under a plain block seats its rows at the container's depth", () => {
    const rows = forest(
      row("P", null),
      row("A", "P", { type: ANCHOR }),
      row("C1", "A"),
    );
    expect(seats(rows).map((s) => s.left)).toEqual([
      blockContentLeft(0),
      blockContentLeft(1),
      blockContentLeft(1),
    ]);
  });
});

// ---------------------------------------------------------------------------
// `borrowedFirstLineCenter` — the vertical seat an anchor cannot measure
// ---------------------------------------------------------------------------

describe("resolveRailSeats — borrowedFirstLineCenter", () => {
  test("an anchor borrows its first visible child's line center; ordinary rows get none", () => {
    const rows = forest(
      row("A", null, { type: ANCHOR }),
      row("C1", "A", { type: HEADING }),
      row("C2", "A"),
    );
    const out = seats(rows);
    expect(out[0]!.borrowedFirstLineCenter).toBe(headingCenter);
    expect(out[1]!.borrowedFirstLineCenter).toBeUndefined();
    expect(out[2]!.borrowedFirstLineCenter).toBeUndefined();
  });

  test("nested anchors walk through to the first row that actually renders a line", () => {
    const rows = forest(
      row("A", null, { type: ANCHOR }),
      row("B", "A", { type: ANCHOR }),
      row("G1", "B", { type: HEADING }),
    );
    const out = seats(rows);
    expect(out[0]!.borrowedFirstLineCenter).toBe(headingCenter);
    expect(out[1]!.borrowedFirstLineCenter).toBe(headingCenter);
  });

  test("a childless anchor takes its OWN one-line fallback seat", () => {
    // `computeFrameSpans` spans it over its own row alone and the row falls back
    // to one empty body line, so the walk terminating on itself is exactly right.
    const rows = forest(row("A", null, { type: ANCHOR }), row("X", null));
    const seat = seats(rows)[0]!;
    expect(seat.borrowedFirstLineCenter).toBe(bodyCenter);
    expect(seat.left).toBe(blockContentLeft(0));
    expect(seat.owner.block.id).toBe("A");
    expect(seat.chevron).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// `absorbedIndent` — the card's left pad, bought from the child indent step
// ---------------------------------------------------------------------------

describe("resolveRailSeats — absorbedIndent: buying the left pad", () => {
  /** Each row's own CONTENT edge, which is what the absorbed count moves. */
  const edges = (rows: Block[]) =>
    seats(rows).map((s, i) =>
      blockContentLeft(depths(rows)[i]!, s.absorbedIndent),
    );
  const depths = (rows: Block[]) =>
    flattenVisible(buildTree(sortByRank(rows)), anchorTypes).map(
      (f) => f.depth,
    );

  test("a card's content sits one FRAME_PAD_X inside its box, not one BLOCK_INDENT", () => {
    const rows = forest(row("A", null, { type: ANCHOR }), row("C", "A"));
    const out = seats(rows);
    // The anchor does NOT absorb its own frame: the box is measured from its
    // content edge, so absorbing there would move the box off the prose x.
    expect(out[0]!.absorbedIndent).toBe(0);
    expect(out[1]!.absorbedIndent).toBe(1);

    const [boxEdge, contentEdge] = edges(rows) as [number, number];
    expect(boxEdge).toBe(blockContentLeft(0)); // unchanged: still the prose x
    expect(contentEdge - boxEdge).toBe(FRAME_PAD_X);
    expect(contentEdge - boxEdge).not.toBe(BLOCK_INDENT);
  });

  test("nesting opens one pad per level, and the boxes stay one pad apart", () => {
    const rows = forest(
      row("A", null, { type: ANCHOR }),
      row("B", "A", { type: ANCHOR }),
      row("G", "B"),
    );
    const [outerBox, innerBox, text] = edges(rows) as [number, number, number];
    expect(innerBox - outerBox).toBe(FRAME_PAD_X);
    expect(text - innerBox).toBe(FRAME_PAD_X);
  });

  test("ordinary nesting INSIDE a card still steps by the full BLOCK_INDENT", () => {
    // The card buys ONE step. A bulleted list nested inside it is ordinary
    // document structure and must keep reading as one.
    const rows = forest(
      row("A", null, { type: ANCHOR }),
      row("C", "A"),
      row("D", "C"),
    );
    const [, first, second] = edges(rows) as [number, number, number];
    expect(second - first).toBe(BLOCK_INDENT);
  });

  test("a container whose GLYPH holds the column absorbs nothing", () => {
    const rows = forest(row("G", null, { type: GLYPH }), row("C", "G"));
    const out = seats(rows);
    expect(out.map((s) => s.absorbedIndent)).toEqual([0, 0]);
    const [boxEdge, contentEdge] = edges(rows) as [number, number];
    // The full step, which is exactly the width of the column the glyph sits in.
    expect(contentEdge - boxEdge).toBe(BLOCK_INDENT);
  });

  test("a `rule` container absorbs nothing either — it pays no pad to buy one", () => {
    const rows = forest(row("Q", null, { type: RULE }), row("C", "Q"));
    expect(seats(rows).map((s) => s.absorbedIndent)).toEqual([0, 0]);
  });
});

// ---------------------------------------------------------------------------
// The pad counts — a card's own inner padding, which only the spans can see
// ---------------------------------------------------------------------------

describe("resolveRailSeats — pad counts: the card's own padding", () => {
  /** `[padFrames, opening, closing, firstLinePad]` per row, in flat order. */
  const pads = (rows: Block[]) =>
    seats(rows).map((s) => [
      s.padFrames,
      s.padFramesOpening,
      s.padFramesClosing,
      s.firstLinePad,
    ]);

  test("the pad is reserved by the frame's FIRST and LAST rendering rows, never its anchor", () => {
    // The anchor is zero-height while it has visible children; padding it would
    // grow it, and the decoration would stop sharing a line with the first child.
    const rows = forest(
      row("A", null, { type: ANCHOR }),
      row("C1", "A"),
      row("C2", "A"),
      row("C3", "A"),
    );
    expect(pads(rows)).toEqual([
      [1, 0, 0, 1], // anchor: reserves nothing, but its glyph seats below the pad
      [1, 1, 0, 1], // first child opens the box
      [1, 0, 0, 0],
      [1, 0, 1, 0], // last child closes it
    ]);
  });

  test("a one-child card opens and closes on the same row", () => {
    const rows = forest(row("A", null, { type: ANCHOR }), row("C", "A"));
    expect(pads(rows)).toEqual([
      [1, 0, 0, 1],
      [1, 1, 1, 1],
    ]);
  });

  test("a CHILDLESS container pads its own row — the one-line fallback it renders", () => {
    const rows = forest(row("A", null, { type: ANCHOR }), row("X", null));
    expect(pads(rows)).toEqual([
      [1, 1, 1, 1],
      [0, 0, 0, 0], // the ordinary row after it reserves nothing
    ]);
  });

  test("nested cards stack: two pads on the row they share, one box each", () => {
    // Every anchor is zero-height, so both boxes begin at the same row — which is
    // exactly why each frame ALSO pulls its own top edge in by the frames around
    // it (`block-editor.tsx`), or the inner card would start on its parent's edge.
    const rows = forest(
      row("A", null, { type: ANCHOR }),
      row("B", "A", { type: ANCHOR }),
      row("G", "B"),
    );
    expect(pads(rows)).toEqual([
      [1, 0, 0, 2],
      [2, 0, 0, 2],
      [2, 2, 2, 2],
    ]);
  });

  test("a `rule` container is invisible to the padding — it has no box to clear", () => {
    const rows = forest(row("Q", null, { type: RULE }), row("C", "Q"));
    expect(pads(rows)).toEqual([
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ]);
  });

  test("a card inside a rule container is padded exactly once — by itself", () => {
    const rows = forest(
      row("Q", null, { type: RULE }),
      row("A", "Q", { type: ANCHOR }),
      row("C", "A"),
    );
    expect(pads(rows)).toEqual([
      [0, 0, 0, 1],
      [1, 0, 0, 1],
      [1, 1, 1, 1],
    ]);
  });
});

// ---------------------------------------------------------------------------
// The frame's OWN insets — where nesting is actually decided
// ---------------------------------------------------------------------------

describe("resolveFramePadInsets — a box's three sides do not share a count", () => {
  /** `[right, top, bottom]` per frame, keyed by container id. */
  const insets = (rows: Block[]) => {
    const flat = flattenVisible(buildTree(sortByRank(rows)), anchorTypes);
    const out = resolveFramePadInsets(
      flat,
      computeFrameSpans(flat, framedTypes),
      handleOf,
      padsBox,
    );
    return Object.fromEntries(
      [...out].map(([id, i]) => [id, [i.right, i.top, i.bottom]]),
    );
  };

  test("a lone card clears nothing on any side", () => {
    const rows = forest(row("A", null, { type: ANCHOR }), row("C", "A"));
    expect(insets(rows)).toEqual({ A: [0, 0, 0] });
  });

  test("cards STACKED at the same opening row clear their parent on all three", () => {
    // Both anchors are zero-height and precede the same first line, so the two
    // boxes would otherwise begin on the same y.
    const rows = forest(
      row("A", null, { type: ANCHOR }),
      row("B", "A", { type: ANCHOR }),
      row("G", "B"),
    );
    expect(insets(rows)).toEqual({ A: [0, 0, 0], B: [1, 1, 1] });
  });

  test("a card starting LATER than its parent clears it horizontally only", () => {
    // The regression this function exists for. The parent's top pad is reserved
    // on `C` — a row the nested card's box does not cover — so pulling the nested
    // box down for it would cancel the pad its own row reserves, leaving the card
    // with no top padding at all. Its bottom still clears: both end on `G`.
    const rows = forest(
      row("A", null, { type: ANCHOR }),
      row("C", "A"),
      row("B", "A", { type: ANCHOR }),
      row("G", "B"),
    );
    expect(insets(rows)).toEqual({ A: [0, 0, 0], B: [1, 0, 1] });
  });

  test("a card ending EARLIER than its parent clears it horizontally only", () => {
    // The mirror: the parent's bottom pad is reserved on `T`, below this box.
    const rows = forest(
      row("A", null, { type: ANCHOR }),
      row("B", "A", { type: ANCHOR }),
      row("G", "B"),
      row("T", "A"),
    );
    expect(insets(rows)).toEqual({ A: [0, 0, 0], B: [1, 1, 0] });
  });

  test("a `rule` container is in none of the counts, and clears nothing itself", () => {
    const rows = forest(
      row("Q", null, { type: RULE }),
      row("A", "Q", { type: ANCHOR }),
      row("C", "A"),
    );
    expect(insets(rows)).toEqual({ Q: [0, 0, 0], A: [0, 0, 0] });
  });
});

// ---------------------------------------------------------------------------
// `chevron` — one slot, and the one control that is NOT unconditionally `owner`
// ---------------------------------------------------------------------------

describe("resolveRailSeats — chevron: one slot, resolved by who needs it most", () => {
  const chevrons = (rows: Block[]) => seats(rows).map((s) => s.chevron);

  test("a COLLAPSED container claims its borrowed line's slot — the way back out", () => {
    const rows = forest(
      row("A", null, { type: ANCHOR, expanded: false }),
      row("C1", "A"),
      row("C2", "A"),
    );
    const out = chevrons(rows);
    expect(out[0]).toBeNull(); // the anchor row itself hosts none
    expect(out[1]).toEqual({ blockId: "A", collapsed: true });
  });

  test("...even when the borrowed line has a chevron of its own, which would lie", () => {
    // C1 is `expanded` with a child, but the box hides it. A chevron rendered
    // open over content nobody can see is a control that lies about its state.
    const rows = forest(
      row("A", null, { type: ANCHOR, expanded: false }),
      row("C1", "A"),
      row("C1a", "C1"),
      row("C2", "A"),
    );
    expect(chevrons(rows)[1]).toEqual({ blockId: "A", collapsed: true });
  });

  test("an EXPANDED container claims it only when the line's own block does not need it", () => {
    const rows = forest(
      row("A", null, { type: ANCHOR, expanded: true }),
      row("C1", "A"),
      row("C2", "A"),
    );
    expect(chevrons(rows)[1]).toEqual({ blockId: "A", collapsed: false });
  });

  test("the borrowed line KEEPS its own chevron when it has children — the rail stays the container's", () => {
    // The deferral is a REACHABILITY rule, not an ownership one: `/callout`
    // wraps the current block, so a collapsed first child is one keystroke away
    // and taking its only chevron would hide content behind nothing. The rest of
    // the rail — `+`, drag, menu — still belongs to the container.
    const rows = forest(
      row("A", null, { type: ANCHOR, expanded: true }),
      row("C1", "A"),
      row("C1a", "C1"),
      row("C2", "A"),
    );
    const seat = seats(rows)[1]!;
    expect(seat.chevron).toEqual({ blockId: "C1", collapsed: false });
    expect(seat.owner.block.id).toBe("A");
  });

  test('a `collapsible: "always"` first child keeps the slot even with no children', () => {
    // Load-bearing: for `sub-page`/`page-link` that chevron is not a fold at all
    // — it drives the composite union's page MOUNT — so taking it would remove
    // the only way to expand a nested page inline. The rail is still the
    // container's.
    const rows = forest(
      row("A", null, { type: ANCHOR, expanded: true }),
      row("C1", "A", { type: TOGGLE }),
      row("C2", "A"),
    );
    const seat = seats(rows)[1]!;
    expect(seat.chevron).toEqual({ blockId: "C1", collapsed: false });
    expect(seat.owner.block.id).toBe("A");
  });

  test("a one-child container claims nothing — its fold hides nothing extra", () => {
    const rows = forest(
      row("A", null, { type: ANCHOR, expanded: true }),
      row("C1", "A"),
    );
    expect(chevrons(rows)[1]).toBeNull();
  });

  test("nested containers: only the OUTERMOST claims the shared borrowed line", () => {
    const rows = forest(
      row("A", null, { type: ANCHOR, expanded: true }),
      row("B", "A", { type: ANCHOR, expanded: true }),
      row("G1", "B"),
      row("G2", "B"),
      row("C2", "A"),
    );
    const out = chevrons(rows);
    expect(out[2]).toEqual({ blockId: "A", collapsed: false });
  });

  test("an ordinary row far from any container is unaffected", () => {
    const rows = forest(row("P", null), row("K", "P"), row("Q", null));
    const out = chevrons(rows);
    expect(out[0]).toEqual({ blockId: "P", collapsed: false });
    expect(out[1]).toBeNull(); // K is childless
    expect(out[2]).toBeNull();
  });
});
