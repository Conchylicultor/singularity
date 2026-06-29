import type { PointerEvent as ReactPointerEvent } from "react";
import { useRef } from "react";
import { MdClose } from "react-icons/md";
import {
  scoreEndBeat,
  type Score,
} from "@plugins/apps/plugins/sonata/plugins/score/core";
import { useSonata } from "@plugins/apps/plugins/sonata/plugins/shell/web";
import { railBandClass } from "@plugins/apps/plugins/sonata/plugins/progress/plugins/scrubber/web";
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
    // band via railBandClass (top-1/2 = rail centre); the band + handles live in
    // a top-half lane below.
    <div
      ref={rootRef}
      // eslint-disable-next-line layout/no-adhoc-layout -- coordinate-driven loop-region root spanning the full marker region so rail-aligned guides and the top-half band lane can be positioned by JS fractions
      className="pointer-events-none absolute inset-0"
    >
      {/* Rail-aligned vertical guides at A and B, drawn through the rail band so
          they line up pixel-for-pixel with the bar ticks. */}
      <div
        // eslint-disable-next-line layout/no-adhoc-layout -- JS fraction-positioned A guide on the shared rail band
        className={cn(railBandClass, "w-px bg-primary/60")}
        style={{ left: `${startF * 100}%` }}
      />
      <div
        // eslint-disable-next-line layout/no-adhoc-layout -- JS fraction-positioned B guide on the shared rail band
        className={cn(railBandClass, "w-px bg-primary/60")}
        style={{ left: `${endF * 100}%` }}
      />

      {/* Top-half lane (mirrors the sections bottom-half) hosting the band +
          handles, so it never overlaps the rail seek track. */}
      <div
        // eslint-disable-next-line layout/no-adhoc-layout -- coordinate-driven top-half loop lane hosting the JS fraction-positioned band + handles
        className="absolute inset-x-0 top-0 h-1/2"
      >
        {/* The loop band [A,B]. Interactive (hover reveals the clear button);
            stopPropagation keeps a click on the band from seeking. Faded +
            outline-only while disabled so the bounds stay visible during a
            play-through. */}
        <div
          {...groupProps}
          onPointerDown={(e) => e.stopPropagation()}
          // eslint-disable-next-line layout/no-adhoc-layout -- JS fraction-positioned loop band (left/width from beatToFraction); inset-y-0 fills the lane height
          className={cn(
            "pointer-events-auto absolute inset-y-0 rounded-sm ring-1 ring-primary/40",
            loop.enabled ? "bg-primary/15" : "opacity-50",
          )}
          style={{ left: `${startF * 100}%`, width: `${widthF * 100}%` }}
          title={loop.enabled ? "Loop A–B" : "Loop A–B (off)"}
        >
          {/* Hover-revealed clear button, pinned to the band's top-right. It must
              re-enable pointer events explicitly (the marker layer is
              pointer-events-none) AND only while revealed — hoverRevealClass owns
              the opacity↔pointer-events coupling, we add the auto needed to punch
              through the inert ancestor only in the revealed branch. */}
          <div
            // eslint-disable-next-line layout/no-adhoc-layout -- clear button pinned to the band's top-right corner
            className={cn(
              "absolute right-0 top-0 -translate-y-full",
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
          </div>
        </div>

        {/* Edge handles. Each is a wide invisible hit area with a thin visible
            bar; pointer-capture keeps the drag tracking off the handle. */}
        <div
          onPointerDown={grabPointer}
          onPointerMove={startHandleDrag}
          // eslint-disable-next-line layout/no-adhoc-layout -- JS fraction-positioned A handle (left from beatToFraction), centered on the edge
          className="pointer-events-auto absolute inset-y-0 w-3 -translate-x-1/2 cursor-ew-resize"
          style={{ left: `${startF * 100}%` }}
          aria-label="Loop start"
        >
          <div
            // eslint-disable-next-line layout/no-adhoc-layout -- visible handle bar centered in its hit area
            className="absolute inset-y-0 left-1/2 w-1 -translate-x-1/2 rounded-full bg-primary"
          />
        </div>
        <div
          onPointerDown={grabPointer}
          onPointerMove={endHandleDrag}
          // eslint-disable-next-line layout/no-adhoc-layout -- JS fraction-positioned B handle (left from beatToFraction), centered on the edge
          className="pointer-events-auto absolute inset-y-0 w-3 -translate-x-1/2 cursor-ew-resize"
          style={{ left: `${endF * 100}%` }}
          aria-label="Loop end"
        >
          <div
            // eslint-disable-next-line layout/no-adhoc-layout -- visible handle bar centered in its hit area
            className="absolute inset-y-0 left-1/2 w-1 -translate-x-1/2 rounded-full bg-primary"
          />
        </div>
      </div>
    </div>
  );
}
