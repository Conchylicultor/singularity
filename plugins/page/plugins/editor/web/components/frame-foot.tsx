import { useMemo, type ComponentType } from "react";
import { useBlockEditor } from "../block-editor-context";
import { useBlockFeet } from "../slots";
import { framePadX, framePadY } from "../internal/page-column";
import type { Block } from "../../core";
import type { BlockEditorAPI, BlockFootProps } from "../types";
import type { FootSeat } from "../internal/frame-foot";

/**
 * Renders whichever foot the container's frame registration supplied. It takes
 * the component as a PROP — the same shape (and the same reason) as
 * `AnchorDecoration` in `block-row.tsx`: a component ARRIVING as a prop is not a
 * component created during render, whereas a local binding off a lookup reads as
 * one to both a human and to `react-hooks/static-components`.
 *
 * `Foot` here is a registry LOOKUP into the memoized `useBlockFeet()` map, whose
 * values are module-level slot contributions, so its identity is stable across
 * renders and no state inside a foot can reset.
 *
 * Like `anchor` and `menu`, a foot is UNSEALED — only a field literally named
 * `component` goes through the framework's error-boundary middleware — so a
 * crash in here is not contained to the slot. The same documented cost its two
 * neighbours carry.
 */
function FootContent({
  component: Foot,
  block,
  editor,
}: {
  component: ComponentType<BlockFootProps>;
  block: Block;
  editor: BlockEditorAPI;
}) {
  return (
    <Foot
      type={block.type}
      data={block.data}
      blockId={block.id}
      editor={editor}
    />
  );
}

/**
 * A container's FOOT, placed: the padded strip at the bottom of the card's box,
 * below its last visible child, holding whatever chrome the container declared
 * (`BlockFrameMeta.foot` — a TODO card's run chips).
 *
 * It renders as a sibling AFTER `<BlockRow>` inside the grid cell of the frame's
 * LAST covered row. That placement is what makes it need no new geometry
 * vocabulary at all: the frame's grid span already covers that row's line, so
 * the card's wash covers the foot with no change to `computeFrameSpans` and no
 * change to any `gridRow` arithmetic. It is in the ROW layer, after the frame in
 * DOM order, so it is clickable — the frame itself is `pointer-events-none` and
 * can never host a control. And its height is its own: nothing declares a foot
 * height, so a chip row wrapping to two lines GROWS the card instead of
 * overlapping its last line. (Pinning the foot absolutely inside a reserved
 * bottom pad was the alternative, and it needs a declared height, which is a
 * silent overlap waiting to happen.)
 *
 * ## It is not a row, and must never look like one
 *
 * No `data-block-id`. `blockRowsIn` / `rowAtPointer`, the marquee and every drop
 * target find rows by that attribute, and a foot is chrome ABOUT a card rather
 * than a line IN it: seeing it as a row would let a drag drop a block into the
 * strip, and let the marquee sweep a line that has no block behind it.
 *
 * ## The four sides are the surface's, in four different counts
 *
 * - LEFT: the card's own CHILDREN's content edge, so the foot lines up under the
 *   text above it rather than with the box's edge (`FootSeat.left`).
 * - RIGHT: the same count an enclosed row reserves — the foot is content inside
 *   the box and clears its right edge exactly as a line of the card does.
 * - BOTTOM: the pads of every frame that closes on THIS foot, which is the whole
 *   point of the closing-slot rule (`internal/frame-foot.ts`).
 * - TOP: one pad, always — the gap between the card's last line and its foot. It
 *   belongs to the surface, not to the contribution, for the same reason the
 *   other three do: the surface owns the box's geometry, and a contribution that
 *   padded itself would be a second opinion about the card's rhythm.
 */
export function FrameFoot({ seat }: { seat: FootSeat }) {
  const feet = useBlockFeet();
  const foot = feet.get(seat.block.type);
  const { makeBlockAPI } = useBlockEditor();
  const api = useMemo(
    () => makeBlockAPI(seat.block.id),
    [makeBlockAPI, seat.block.id],
  );

  if (!foot) {
    // The seats were resolved from THIS map (`resolveFrameFeet` takes its
    // membership as `hasFoot`), so a miss means the two reads disagreed — the
    // surface would silently render a card whose bottom pad has moved below a
    // strip that is not there. Loud beats a card with a gap under it.
    throw new Error(
      `page/editor: no foot registered for container type "${seat.block.type}", but a foot seat was resolved for it`,
    );
  }

  return (
    <div
      style={{
        paddingLeft: seat.left,
        paddingRight: framePadX(seat.padFrames),
        paddingTop: framePadY(1),
        paddingBottom: framePadY(seat.padClosing),
      }}
    >
      <FootContent component={foot} block={seat.block} editor={api} />
    </div>
  );
}
