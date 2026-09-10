import { describe, expect, it } from "bun:test";
import type { Block } from "../../core";
import { computeFrameSpans, type FlatBlock } from "./block-frames";
import { resolveClosingSlots, resolveFrameFeet } from "./frame-foot";
import { BLOCK_INDENT, FRAME_PAD_X, blockContentLeft } from "./page-column";

/** A flatten entry; only `id`/`type`/`depth` reach the frame geometry. */
function entry(id: string, type: string, depth: number): FlatBlock {
  return {
    block: { id, type } as unknown as Block,
    depth,
    childCount: 0,
    ordinal: 1,
    firstVisibleChildType: null,
  };
}

// The container shapes the closing-slot rule has to tell apart. The three facts
// a frame carries here — does it PAD, does it ABSORB its children's indent step,
// does it render a FOOT — are independent, so the fixtures cross them.
const CARD = "card"; // padded, absorbing, no foot — an annotation card today
const FOOTED = "footed"; // the same, plus a foot — the TODO card
const RULE = "rule"; // paints a bar: no pad at all (the quote)
const RULE_FOOTED = "rule-footed"; // …and one that still renders a foot
const GLYPH = "glyph"; // padded, but its gutter glyph holds the indent column
const GLYPH_FOOTED = "glyph-footed"; // …with a foot, so its foot keeps that step

const framedTypes = new Set([
  CARD,
  FOOTED,
  RULE,
  RULE_FOOTED,
  GLYPH,
  GLYPH_FOOTED,
]);
const padsBox = (type: string) =>
  type === CARD || type === FOOTED || type === GLYPH || type === GLYPH_FOOTED;
const absorbsIndent = (type: string) => type === CARD || type === FOOTED;
const hasFoot = (type: string) =>
  type === FOOTED || type === RULE_FOOTED || type === GLYPH_FOOTED;

/** The whole pipeline: flatten → spans → slots. */
function slotsOf(flat: FlatBlock[]) {
  return resolveClosingSlots(
    flat,
    computeFrameSpans(flat, framedTypes),
    padsBox,
    hasFoot,
  );
}

/** Where each frame's own bottom pad landed, keyed by container id. */
function landings(flat: FlatBlock[]): Record<string, string> {
  return Object.fromEntries(slotsOf(flat).slotKeyOf);
}

function feetOf(flat: FlatBlock[]) {
  return resolveFrameFeet(
    flat,
    computeFrameSpans(flat, framedTypes),
    padsBox,
    absorbsIndent,
    hasFoot,
  );
}

describe("resolveClosingSlots — nothing has a foot, so nothing moved", () => {
  // The load-bearing property of the whole rule: with no feet on the page it
  // must produce the pre-foot answer exactly, or every existing card moves.
  it("lands every frame's pad on its last row, as it always did", () => {
    const flat = [entry("A", CARD, 0), entry("C", "text", 1)];
    const slots = slotsOf(flat);
    expect(slots.row).toEqual([0, 1]);
    expect([...slots.foot]).toEqual([]);
    expect(landings(flat)).toEqual({ A: "row:1" });
  });

  it("stacks nested cards' pads on the row they both end on", () => {
    const flat = [
      entry("A", CARD, 0),
      entry("B", CARD, 1),
      entry("G", "text", 2),
    ];
    const slots = slotsOf(flat);
    expect(slots.row).toEqual([0, 0, 2]);
    expect(landings(flat)).toEqual({ A: "row:2", B: "row:2" });
  });

  it("gives an UNPADDED frame a slot key too, while counting no pad for it", () => {
    // `resolveFramePadInsets` asks the question of every frame and compares the
    // answers, so a missing entry would make two frames match on `undefined`.
    const flat = [entry("Q", RULE, 0), entry("C", "text", 1)];
    const slots = slotsOf(flat);
    expect(slots.row).toEqual([0, 0]);
    expect(slots.slotKeyOf.get("Q")).toBe("row:1");
  });
});

describe("resolveClosingSlots — one footed card", () => {
  it("moves the card's own pad off its last row and onto its foot", () => {
    const flat = [
      entry("F", FOOTED, 0),
      entry("C1", "text", 1),
      entry("C2", "text", 1),
    ];
    const slots = slotsOf(flat);
    // The last row reserves nothing: the pad now sits BELOW the foot, or it
    // would land between the card's last line and its chrome.
    expect(slots.row).toEqual([0, 0, 0]);
    expect(slots.foot.get("F")).toBe(1);
    expect(landings(flat)).toEqual({ F: "foot:F" });
  });

  it("leaves a card ending on ANOTHER row exactly where it was", () => {
    const flat = [
      entry("A", CARD, 0),
      entry("C", "text", 1),
      entry("F", FOOTED, 1),
      entry("G", "text", 2),
      entry("T", "text", 1),
    ];
    // A ends on T (row 4), F on G (row 3) — different rows, different slots.
    const slots = slotsOf(flat);
    expect(slots.row).toEqual([0, 0, 0, 0, 1]);
    expect(slots.foot.get("F")).toBe(1);
  });
});

describe("resolveClosingSlots — a foot is the last slot INSIDE its enclosers", () => {
  it("a footed card as the LAST CHILD carries its parent's pad too", () => {
    // The nesting real pages already have: a TODO card ending an agent-note.
    // Both boxes end on `G`, and the foot is inside both — so the reading order
    // is [content][gap][chips][todo pad][note pad], both pads below the foot.
    const flat = [
      entry("A", CARD, 0),
      entry("K", "text", 1),
      entry("F", FOOTED, 1),
      entry("G", "text", 2),
    ];
    const slots = slotsOf(flat);
    expect(slots.row).toEqual([0, 0, 0, 0]);
    expect(slots.foot.get("F")).toBe(2);
    expect(landings(flat)).toEqual({ A: "foot:F", F: "foot:F" });
  });

  it("an UNPADDED footed container opens a slot without placing a pad in it", () => {
    // A `pad: "rule"` container has no box to close, so it brings no pad of its
    // own — but it still RENDERS a foot, and the card around it closes on that
    // foot like any other last slot.
    const flat = [
      entry("A", CARD, 0),
      entry("Q", RULE_FOOTED, 1),
      entry("G", "text", 2),
    ];
    const slots = slotsOf(flat);
    expect(landings(flat)).toEqual({ A: "foot:Q", Q: "foot:Q" });
    expect(slots.foot.get("Q")).toBe(1); // the card's pad; the bar has none
    expect(slots.row).toEqual([0, 0, 0]);
  });

  it("a card ENCLOSED by the footed one keeps the row — the foot is below it", () => {
    // The mirror, and the one case where "same slot" stops meaning "same row":
    // F's foot renders after the row, so it is outside B's box entirely. B's pad
    // must stay on the row; only F's goes below the foot.
    const flat = [
      entry("F", FOOTED, 0),
      entry("B", CARD, 1),
      entry("G", "text", 2),
    ];
    const slots = slotsOf(flat);
    expect(slots.row).toEqual([0, 0, 1]);
    expect(slots.foot.get("F")).toBe(1);
    expect(landings(flat)).toEqual({ F: "foot:F", B: "row:2" });
  });

  it("two footed cards ending on one row take one pad each, on their own feet", () => {
    const flat = [
      entry("OUT", FOOTED, 0),
      entry("IN", FOOTED, 1),
      entry("G", "text", 2),
    ];
    const slots = slotsOf(flat);
    expect(slots.row).toEqual([0, 0, 0]);
    // Each closes on its OWN foot: a frame's own foot is the last thing inside
    // it, and the outer card's foot renders after the inner card's.
    expect(landings(flat)).toEqual({ OUT: "foot:OUT", IN: "foot:IN" });
    expect(slots.foot.get("IN")).toBe(1);
    expect(slots.foot.get("OUT")).toBe(1);
  });

  it("a footed card containing a plain nested card: only its own pad moves", () => {
    const flat = [
      entry("F", FOOTED, 0),
      entry("B", CARD, 1),
      entry("G", "text", 2),
      entry("T", "text", 1),
    ];
    const slots = slotsOf(flat);
    // B ends on G and closes there; F ends on T and closes on its foot.
    expect(slots.row).toEqual([0, 0, 1, 0]);
    expect(landings(flat)).toEqual({ F: "foot:F", B: "row:2" });
  });
});

describe("resolveFrameFeet — placement", () => {
  it("returns nothing when no container declares a foot", () => {
    const flat = [
      entry("A", CARD, 0),
      entry("B", CARD, 1),
      entry("G", "text", 2),
    ];
    expect(feetOf(flat)).toEqual([]);
  });

  it("places a foot in the cell of the row its frame's box ends on", () => {
    const flat = [
      entry("F", FOOTED, 0),
      entry("C1", "text", 1),
      entry("C2", "text", 1),
      entry("AFTER", "text", 0),
    ];
    const [foot] = feetOf(flat);
    expect(foot).toBeDefined();
    expect(foot!.block.id).toBe("F");
    expect(foot!.row).toBe(2); // C2 — the last row the box covers, not the one after
  });

  it("aligns with the card's CHILDREN, not with the box's own edge", () => {
    const flat = [entry("F", FOOTED, 0), entry("C", "text", 1)];
    const [foot] = feetOf(flat);
    // An absorbing card reclaims the indent step and spends it as its pad, so
    // its children — and its foot with them — sit one FRAME_PAD_X inside the box.
    expect(foot!.left).toBe(blockContentLeft(1, 1));
    expect(foot!.left - blockContentLeft(0)).toBe(FRAME_PAD_X);
  });

  it("keeps the full indent step when the card's GLYPH holds that column", () => {
    // A gutter-glyph container absorbs nothing — its icon stands in exactly the
    // column absorption would reclaim — so its foot sits one whole BLOCK_INDENT
    // inside the box, where its children are.
    const flat = [entry("G", GLYPH_FOOTED, 0), entry("C", "text", 1)];
    const [foot] = feetOf(flat);
    expect(foot!.left).toBe(blockContentLeft(1, 0));
    expect(foot!.left - blockContentLeft(0)).toBe(BLOCK_INDENT);
  });

  it("clears the box's right edge by the same count an enclosed row does", () => {
    const flat = [
      entry("A", CARD, 0),
      entry("F", FOOTED, 1),
      entry("G", "text", 2),
    ];
    const [foot] = feetOf(flat);
    // Its own frame plus the card around it — one MORE than either box pulls
    // its own right edge in by, which is what makes that difference the padding.
    expect(foot!.padFrames).toBe(2);
  });

  it("carries exactly the pads the closing-slot rule put on it", () => {
    const flat = [
      entry("A", CARD, 0),
      entry("K", "text", 1),
      entry("F", FOOTED, 1),
      entry("G", "text", 2),
    ];
    const [foot] = feetOf(flat);
    // Asserted against the resolver rather than against a literal: the foot's
    // padding and the rows' must come from ONE answer, which is the whole
    // reason `resolveClosingSlots` exists.
    expect(foot!.padClosing).toBe(slotsOf(flat).foot.get("F")!);
    expect(foot!.padClosing).toBe(2); // F's own, and the card that ends with it
  });

  it("orders feet on one row innermost first — the order their pads stack in", () => {
    const flat = [
      entry("OUT", FOOTED, 0),
      entry("IN", FOOTED, 1),
      entry("G", "text", 2),
    ];
    const feet = feetOf(flat);
    expect(feet.map((f) => f.block.id)).toEqual(["IN", "OUT"]);
    expect(feet.map((f) => f.row)).toEqual([2, 2]);
    expect(feet.map((f) => f.padClosing)).toEqual([1, 1]);
    // The inner card's foot lines up one pad further in than the outer's.
    expect(feet[0]!.left - feet[1]!.left).toBe(FRAME_PAD_X);
  });

  it("orders feet across rows in document order", () => {
    const flat = [
      entry("F1", FOOTED, 0),
      entry("A", "text", 1),
      entry("F2", FOOTED, 0),
      entry("B", "text", 1),
    ];
    expect(feetOf(flat).map((f) => `${f.block.id}@${f.row}`)).toEqual([
      "F1@1",
      "F2@3",
    ]);
  });

  it("gives a CHILDLESS footed container a foot on its own row", () => {
    // `computeFrameSpans` spans it over its own row alone, where the surface
    // renders the one-empty-line fallback — so the foot goes there too.
    const flat = [entry("F", FOOTED, 0), entry("X", "text", 0)];
    const [foot] = feetOf(flat);
    expect(foot!.row).toBe(0);
    expect(foot!.padClosing).toBe(1);
  });
});
