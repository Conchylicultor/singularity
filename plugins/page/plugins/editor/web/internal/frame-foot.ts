import { computeFrameCounts } from "./block-frames";
import { blockContentLeft } from "./page-column";
import type { Block } from "../../core";
import type { FlatBlock, FrameSpan } from "./block-frames";

/**
 * A container's FOOT: a strip of the container's own chrome at the bottom of the
 * box, below its last visible child, inside the card's padding — a TODO card's
 * chips for the runs it launched. A container declares one with
 * `BlockFrameMeta.foot`; nothing else in the editor knows what is in it.
 *
 * ## Why the padding algebra had to grow a word
 *
 * A frame is a BACKDROP and can make no vertical space of its own, so the ROWS
 * reserve a card's padding: the first row a padded frame covers reserves its
 * `padding-top`, and the LAST ROW it covers reserved its `padding-bottom`
 * (`RailSeat.padFramesClosing`). A foot renders AFTER that row — it is flow
 * content in the same grid cell, a sibling following `<BlockRow>` — so a footed
 * card's bottom pad has to move past it. Left where it was, the pad would land
 * between the card's last line and its chips and the card would have no bottom
 * edge at all.
 *
 * So "which ROW closes a frame" becomes "which SLOT closes it". At flat row `i`
 * the slots are, in order:
 *
 * ```
 * [ the row itself ] [ F₁'s foot ] [ F₂'s foot ] … [ F_k's foot ]
 * ```
 *
 * where `F₁ ⊂ F₂ ⊂ … ⊂ F_k` are the footed frames ending at `i`, innermost
 * first — which is also the order they render in.
 *
 * > A frame `P` ending at row `i` reserves its bottom pad on the LAST slot
 * > CONTAINED in `P` — the outermost `F_m` with `F_m.start >= P.start`, or the
 * > row when there is none.
 *
 * Spans nest and never partially overlap, so `F.start >= P.start` is exactly
 * `F ⊆ P`; a footed frame is a candidate for ITS OWN pad (its foot is the last
 * thing inside it), and a frame outside every foot on that row keeps the row.
 * With nothing declaring a foot the rule degenerates to today's answer, byte for
 * byte, which is what keeps every existing card pixel-identical.
 *
 * It is also the answer real pages need: a TODO nested as the last child of an
 * agent-note, both padded, gives `[content][gap][chips][todo pad][note pad]` —
 * the inner card's pad AND the outer card's pad both land on the one foot, in
 * that order, because the foot is the last slot inside both.
 *
 * ## One resolution, three readers
 *
 * `resolveRailSeats` (the row's `padding-bottom`), `resolveFramePadInsets` (which
 * enclosing frames' pads sit BELOW a box) and the foot itself (its own
 * `padding-bottom`) must agree about this, so it is resolved ONCE here — the same
 * reason `frameOpenRow` exists in `rail-seat.ts` rather than being walked twice.
 */
export interface ClosingSlots {
  /**
   * Per flat index: how many PADDED frames reserve their bottom pad on that ROW.
   * What `RailSeat.padFramesClosing` is, and what the row turns into
   * `padding-bottom`.
   */
  row: number[];
  /**
   * Per FOOTED container id: how many PADDED frames reserve theirs on that
   * FOOT — its own frame included when it pads. Every footed container has an
   * entry, `0` included, so a lookup answering `undefined` means "not a footed
   * container" rather than "no pads there".
   */
  foot: ReadonlyMap<string, number>;
  /**
   * Per container id — padded or not — the slot its OWN bottom pad landed on, as
   * a comparable key (`"row:<i>"` / `"foot:<blockId>"`).
   *
   * A key rather than a structure because the only question asked of it is
   * whether two frames close on the SAME slot, which used to be `a.end === b.end`
   * and is no longer: two frames can end on one row and still close in different
   * places, one of them below a foot the other renders.
   */
  slotKeyOf: ReadonlyMap<string, string>;
}

/** `"row:<i>"` — the slot every frame closed on before feet existed. */
function rowSlotKey(row: number): string {
  return `row:${row}`;
}

/** `"foot:<blockId>"` — the slot a footed container's own chrome opens up. */
function footSlotKey(blockId: string): string {
  return `foot:${blockId}`;
}

/**
 * Resolve, for every frame, which SLOT at its last covered row reserves its
 * bottom pad — see {@link ClosingSlots} for the rule and why it is one walk.
 *
 * `spans` is EVERY frame (a `"rule"` container may declare a foot too, and its
 * foot is then a slot the padded frames around it can close on); `padsBox` is
 * what decides whose pad is being placed, and `hasFoot` which frames open a slot.
 */
export function resolveClosingSlots(
  flat: readonly FlatBlock[],
  spans: readonly FrameSpan[],
  padsBox: (type: string) => boolean,
  hasFoot: (type: string) => boolean,
): ClosingSlots {
  // The footed frames ending at each row, innermost first — which is the slot
  // order after the row itself, and the order the feet render in.
  const feetByRow = new Map<number, FrameSpan[]>();
  for (const span of spans) {
    if (!hasFoot(span.block.type)) continue;
    const at = feetByRow.get(span.end);
    if (at) at.push(span);
    else feetByRow.set(span.end, [span]);
  }
  for (const feet of feetByRow.values()) feet.sort((a, b) => b.start - a.start);

  const row = flat.map(() => 0);
  const foot = new Map<string, number>();
  for (const feet of feetByRow.values())
    for (const f of feet) foot.set(f.block.id, 0);
  const slotKeyOf = new Map<string, string>();

  for (const span of spans) {
    // The LAST slot contained in this frame. The feet are sorted innermost
    // first, so the outermost contained one is the last entry that still starts
    // at or after this frame's own start.
    const feet = feetByRow.get(span.end) ?? [];
    let landed: FrameSpan | undefined;
    for (const f of feet) if (f.start >= span.start) landed = f;

    slotKeyOf.set(
      span.block.id,
      landed ? footSlotKey(landed.block.id) : rowSlotKey(span.end),
    );
    // Only a PADDED frame has a pad to place; an unpadded one still gets a slot
    // key, because `resolveFramePadInsets` asks the question of every frame.
    if (!padsBox(span.block.type)) continue;
    if (landed) foot.set(landed.block.id, foot.get(landed.block.id)! + 1);
    else row[span.end] = row[span.end]! + 1;
  }

  return { row, foot, slotKeyOf };
}

/**
 * One container foot, placed: everything the surface needs to render the strip,
 * and nothing about what is in it.
 *
 * It is deliberately NOT a `RailSeat`-style per-row record. A foot belongs to a
 * FRAME (there is one per footed container, wherever that container's box ends),
 * where a seat belongs to a row — so a row hosting two feet is a list, not a
 * field, and the surface groups them itself.
 */
export interface FootSeat {
  /** The container whose foot this is. */
  block: Block;
  /**
   * The flat index whose grid cell hosts it — the frame's `span.end`. The frame
   * already spans that row's grid line, so the card's wash covers the foot with
   * no change to any `gridRow` arithmetic anywhere.
   */
  row: number;
  /**
   * Left edge (px from the row's own border edge): the content edge of the
   * card's CHILDREN, one level deeper than the box's own — so the foot lines up
   * under the text above it rather than with the box's edge.
   */
  left: number;
  /**
   * `padding-right`, in pads: the same count an enclosed ROW reserves, this
   * container's own frame included. The foot is content inside the box, so it
   * clears the box's right edge exactly as a line of the card does.
   */
  padFrames: number;
  /**
   * `padding-bottom`, in pads: the frames whose bottom pad landed on THIS foot —
   * this one's own, plus every enclosing padded frame that closes here too. See
   * {@link ClosingSlots}.
   */
  padClosing: number;
}

/**
 * Every container foot on the page, in RENDER ORDER: grouped by row, innermost
 * first within a row (the slot order of {@link ClosingSlots}, so the pads below
 * the feet stack in the same order the boxes nest).
 *
 * `padsBox` / `absorbsIndent` are the two halves of `useFrameGeometry()` and
 * `hasFoot` is `useBlockFeet()`'s membership — the same predicates
 * `resolveRailSeats` takes, so a foot's geometry and the rows' cannot drift.
 */
export function resolveFrameFeet(
  flat: readonly FlatBlock[],
  spans: readonly FrameSpan[],
  padsBox: (type: string) => boolean,
  absorbsIndent: (type: string) => boolean,
  hasFoot: (type: string) => boolean,
): FootSeat[] {
  const footed = spans.filter((s) => hasFoot(s.block.type));
  if (footed.length === 0) return [];

  const paddedCovering = computeFrameCounts(
    flat,
    spans.filter((s) => padsBox(s.block.type)),
  );
  const absorbingCovering = computeFrameCounts(
    flat,
    spans.filter((s) => absorbsIndent(s.block.type)),
  );
  const closing = resolveClosingSlots(flat, spans, padsBox, hasFoot);

  return footed
    .slice()
    .sort((a, b) => a.end - b.end || b.start - a.start)
    .map((span) => ({
      block: span.block,
      row: span.end,
      // The card's CHILDREN's content edge: one depth step in from the box, less
      // whatever the enclosing frames (this one included, when it absorbs) have
      // reclaimed of that step to spend as padding. Read at the anchor row,
      // which is where the box itself is measured from — a child row deeper in
      // the subtree would be a different count.
      left: blockContentLeft(span.depth + 1, absorbingCovering[span.start]!),
      padFrames: paddedCovering[span.start]!,
      padClosing: closing.foot.get(span.block.id)!,
    }));
}
