import { Layer } from "@plugins/primitives/plugins/css/plugins/layer/web";
import type { PointerEvent as ReactPointerEvent } from "react";
import { useRef } from "react";
import { MdClose } from "react-icons/md";
import {
  scoreEndBeat,
  type Score,
} from "@plugins/apps/plugins/sonata/plugins/score/core";
import { useSonata } from "@plugins/apps/plugins/sonata/plugins/shell/web";
import { RAIL_BAND_Y } from "@plugins/apps/plugins/sonata/plugins/progress/plugins/scrubber/web";
import {
  pct,
  Placed,
} from "@plugins/primitives/plugins/css/plugins/coords/web";
import { IconButton } from "@plugins/primitives/plugins/icon-button/web";
import {
  useHoverReveal,
  hoverRevealClass,
} from "@plugins/primitives/plugins/hover-reveal/web";
import {
  cn,
  ControlSizeProvider,
} from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { snapToBars } from "../loop-actions";

/**
 * The A–B practice-loop region marker. Draws the loop `[start, end]` as a band
 * with two draggable edge handles in the TOP half of the marker layer (sections
 * own the bottom half), plus rail-aligned vertical guides through the track and
 * a hover-revealed clear button.
 *
 * Pointer model (load-bearing): the marker layer the scrubber hosts is
 * `pointer-events-none`, so clicks fall through to the seek track. We keep the
 * root and the guides pointer-transparent and make ONLY the band (for hover +
 * clear) and the handles (for drag) interactive (`pointer-events-auto`). Every
 * interactive element `stopPropagation()`s its `pointerdown` so grabbing a
 * handle (or the band) never also fires the parent slider's `seekToPointer`.
 *
 * Beat projection: handle drags read the root's `getBoundingClientRect()` and
 * map `clientX` exactly the way the scrubber's `seekToPointer` does
 * (`(x - left) / width * endBeat`), snapped to bar lines unless Alt is held.
 * `setLoop` clamps + enforces the min-gap, so the handles can never cross.
 */
export function LoopRegion({
  score,
  beatToFraction,
}: {
  score: Score;
  beatToFraction: (beat: number) => number;
}) {
  const { loop, setLoop } = useSonata();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const { revealed, groupProps } = useHoverReveal();

  const endBeat = scoreEndBeat(score);
  // No region (or nothing to anchor to) → render nothing.
  if (!loop || endBeat <= 0) return null;

  const startF = beatToFraction(loop.start);
  const endF = beatToFraction(loop.end);
  const widthF = Math.max(0, endF - startF);

  // clientX → beat, using the SAME projection as the scrubber's seek. Snaps to
  // bar lines unless Alt is held for fine placement.
  const beatFromClientX = (clientX: number, altKey: boolean): number => {
    const rect = rootRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return 0;
    const f = (clientX - rect.left) / rect.width;
    const beat = Math.max(0, Math.min(1, f)) * endBeat;
    return altKey ? beat : snapToBars(beat, score);
  };

  const startHandleDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    if ((e.buttons & 1) === 0) return;
    setLoop({ ...loop, start: beatFromClientX(e.clientX, e.altKey) });
  };
  const endHandleDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    if ((e.buttons & 1) === 0) return;
    setLoop({ ...loop, end: beatFromClientX(e.clientX, e.altKey) });
  };

  const grabPointer = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  return (
    // Full-region root (pointer-transparent) so the guides can align to the rail
    // band via RAIL_BAND_Y (centred on the rail); the band + handles live in
    // a top-half lane below.
    <Layer ref={rootRef} decorative>
      {/* Rail-aligned vertical guides at A and B, drawn through the rail band so
          they line up pixel-for-pixel with the bar ticks. */}
      <Placed
        x={{ start: pct(startF), size: 1 }}
        y={RAIL_BAND_Y}
        className="bg-primary/60"
      />
      <Placed
        x={{ start: pct(endF), size: 1 }}
        y={RAIL_BAND_Y}
        className="bg-primary/60"
      />

      {/* Top-half lane (mirrors the sections bottom-half) hosting the band +
          handles, so it never overlaps the rail seek track. */}
      <Placed x={{ start: 0, end: 0 }} y={{ start: 0, size: "50%" }}>
        {/* The loop band [A,B]. Interactive (hover reveals the clear button);
            stopPropagation keeps a click on the band from seeking. Faded +
            outline-only while disabled so the bounds stay visible during a
            play-through. */}
        <Placed
          {...groupProps}
          onPointerDown={(e) => e.stopPropagation()}
          x={{ start: pct(startF), size: pct(widthF) }}
          y="fill"
          className={cn(
            "pointer-events-auto rounded-sm ring-1 ring-primary/40",
            loop.enabled ? "bg-primary/15" : "opacity-50",
          )}
          title={loop.enabled ? "Loop A–B" : "Loop A–B (off)"}
        >
          {/* Hover-revealed clear button, pinned to the band's top-right. It must
              re-enable pointer events explicitly (the marker layer is
              pointer-events-none) AND only while revealed — hoverRevealClass owns
              the opacity↔pointer-events coupling, we add the auto needed to punch
              through the inert ancestor only in the revealed branch. */}
          <Placed
            x={{ end: 0 }}
            y={{ start: 0, shift: "-100%" }}
            className={cn(
              hoverRevealClass(revealed),
              revealed && "pointer-events-auto",
            )}
          >
            <ControlSizeProvider size="xs">
              <IconButton
                icon={MdClose}
                label="Clear loop"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => setLoop(null)}
              />
            </ControlSizeProvider>
          </Placed>
        </Placed>

        {/* Edge handles. Each is a wide invisible hit area with a thin visible
            bar; pointer-capture keeps the drag tracking off the handle. */}
        <Placed
          onPointerDown={grabPointer}
          onPointerMove={startHandleDrag}
          x={{ center: pct(startF), size: 12 }}
          y="fill"
          className="pointer-events-auto cursor-ew-resize"
          aria-label="Loop start"
        >
          {/* The visible bar, centered in its hit area. */}
          <Placed
            x={{ center: "50%", size: 4 }}
            y="fill"
            className="rounded-full bg-primary"
          />
        </Placed>
        <Placed
          onPointerDown={grabPointer}
          onPointerMove={endHandleDrag}
          x={{ center: pct(endF), size: 12 }}
          y="fill"
          className="pointer-events-auto cursor-ew-resize"
          aria-label="Loop end"
        >
          {/* The visible bar, centered in its hit area. */}
          <Placed
            x={{ center: "50%", size: 4 }}
            y="fill"
            className="rounded-full bg-primary"
          />
        </Placed>
      </Placed>
    </Layer>
  );
}
