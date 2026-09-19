import { Placed } from "@plugins/primitives/plugins/css/plugins/coords/web";
import { Layer } from "@plugins/primitives/plugins/css/plugins/layer/web";
import type { PointerEvent as ReactPointerEvent } from "react";
import { useRef } from "react";
import type { Projection } from "@plugins/apps/plugins/sonata/plugins/score/core";
import { useSonata } from "@plugins/apps/plugins/sonata/plugins/shell/web";
import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { snapToBars } from "../loop-actions";
import { useLoopEdgeBuckets } from "../loop-edge-state";

/** Height (px) of the invisible grab strip centred on each boundary line. */
const HANDLE_HIT_PX = 12;

/** Pointer handlers that drag one loop boundary; spread onto its grab targets. */
type BoundaryDragProps = {
  onPointerDown: (e: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerMove: (e: ReactPointerEvent<HTMLDivElement>) => void;
};

/**
 * The A–B practice loop, surfaced on the piano roll's falling-note timeline: a
 * band spanning `[A, B]` with a boundary line + letter label at each edge,
 * anchored to the time axis via the published `projection` and rendered inside
 * the display's scroll layer — so it scrolls glued to the notes (A/B fall toward
 * the now-line exactly as the music reaches them).
 *
 * Both boundaries are draggable here too, not only on the progression bar: a
 * full-width grab strip over each line (and its letter chip) moves that bound,
 * snapped to bar lines unless Alt is held — the same rule as the bar's handles.
 * Everything else stays pointer-transparent, so a drag anywhere else on the lane
 * still scrubs the song. The grab targets `stopPropagation()` their
 * `pointerdown` so grabbing a boundary never also starts the lane's scrub.
 *
 * Mirrors the progress-bar `LoopRegion`'s visual language (primary tint + ring;
 * faded / outline-only while disabled) so the same loop reads as the same thing
 * on both surfaces.
 *
 * Beat ↔ Y projection: `projection.beatToY` is CONTENT-space and negative for
 * positive beats (future = more negative = higher up). `B` (end) is further in
 * the future than `A` (start), so `beatToY(end) < beatToY(start)`: the band's
 * top is `beatToY(end)` and its height is `beatToY(start) - beatToY(end)`. A
 * drag maps back with `projection.yToBeat`, measuring the pointer against this
 * layer's own top edge — the content origin, wherever the scroll has put it.
 */
export function LoopRollRegion({ projection }: { projection: Projection }) {
  const { loop, setLoop, score } = useSonata();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const { beatToY, yToBeat } = projection;
  // Which boundaries have scrolled off-screen (so their content-space label is
  // hidden — the screen-anchored edge chip stands in for it). Called BEFORE the
  // early return so hook order stays stable; it early-returns empty internally
  // when there's no loop / time axis.
  const { top: edgeTop, bottom: edgeBottom } = useLoopEdgeBuckets(projection);
  // No region, or a display without a real time axis → render nothing.
  if (!loop || !beatToY || !yToBeat) return null;

  const yA = beatToY(loop.start); // A — lower on screen (less negative)
  const yB = beatToY(loop.end); // B — higher on screen (more negative)
  const top = yB;
  const height = Math.max(0, yA - yB);

  // A boundary is on-screen iff it's in neither edge bucket → show its label.
  const aOn = !edgeTop.includes("A") && !edgeBottom.includes("A");
  const bOn = !edgeTop.includes("B") && !edgeBottom.includes("B");

  // Pointer → beat: the layer's top edge is content Y 0, so the pointer's
  // offset from it is a content-space Y. `setLoop` clamps and keeps the min
  // gap, so the boundaries can never cross.
  const dragBoundary = (edge: "start" | "end"): BoundaryDragProps => ({
    onPointerDown: (e) => {
      e.stopPropagation();
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    onPointerMove: (e) => {
      const rect = rootRef.current?.getBoundingClientRect();
      if (!rect || (e.buttons & 1) === 0) return;
      const beat = yToBeat(e.clientY - rect.top);
      setLoop({ ...loop, [edge]: e.altKey ? beat : snapToBars(beat, score) });
    },
  });
  const dragA = dragBoundary("start");
  const dragB = dragBoundary("end");

  return (
    // Full-bleed, pointer-transparent: its top edge is the content origin the
    // drag measures against; only the grab strips and labels take the pointer.
    <Layer ref={rootRef} decorative>
      {/* The [A, B] span, drawn as a TRANSPARENT outline — no fill, since a wash
          over the falling notes reads as distracting. The 2px border frames the
          region: the left/right edges are the "inside a loop" side rails, and the
          top/bottom edges are the B and A boundary lines (pixel-exact on the
          bounds, all in one element). Solid while looping; dashed while the loop
          is defined-but-disabled. */}
      <Placed
        x="fill"
        y={{ start: top, size: height }}
        className={cn(
          "border-2",
          loop.enabled ? "border-primary" : "border-dashed border-primary/45",
        )}
      />
      {/* Grab strips over the B (top) and A (bottom) boundary lines. */}
      <BoundaryHandle y={yB} label="Loop end (B)" drag={dragB} />
      <BoundaryHandle y={yA} label="Loop start (A)" drag={dragA} />
      {/* B label tucked just below its top edge; A label just above its bottom
          edge — both stay inside the band, clear of the lane edges. Each shows
          only while its boundary is on-screen; once a boundary scrolls past the
          lookahead the edge chip (LoopRollEdge) stands in for the label. Each
          label is a grab target for its boundary too. */}
      {bOn ? (
        <LoopLabel
          y={yB}
          label="B"
          enabled={loop.enabled}
          side="below"
          drag={dragB}
        />
      ) : null}
      {aOn ? (
        <LoopLabel
          y={yA}
          label="A"
          enabled={loop.enabled}
          side="above"
          drag={dragA}
        />
      ) : null}
    </Layer>
  );
}

/**
 * The invisible full-width grab strip centred on one boundary line. Tints on
 * hover (with the resize cursor) so the line reads as something you can drag.
 */
function BoundaryHandle({
  y,
  label,
  drag,
}: {
  y: number;
  label: string;
  drag: BoundaryDragProps;
}) {
  return (
    <Placed
      {...drag}
      x="fill"
      y={{ center: y, size: HANDLE_HIT_PX }}
      className="pointer-events-auto cursor-ns-resize hover:bg-primary/25"
      aria-label={label}
      title={`${label} — drag to move, hold Alt to move off the bar lines`}
    />
  );
}

/**
 * A loop-boundary letter chip ("A" / "B"), pinned to the right edge at its
 * content-space `y` and offset just inside the band (`below` the top edge, or
 * `above` the bottom edge). Fades with the loop's enabled state. Also a grab
 * target for its boundary, the easier one to find than the thin line.
 */
function LoopLabel({
  y,
  label,
  enabled,
  side,
  drag,
}: {
  y: number;
  label: string;
  enabled: boolean;
  side: "above" | "below";
  drag: BoundaryDragProps;
}) {
  return (
    // Pinned to the right edge at a runtime content-space Y; the `shift` is what
    // keeps an "above" chip just inside the band rather than straddling it.
    <Placed
      {...drag}
      x={{ end: 0 }}
      y={{ start: y, shift: side === "above" ? "-100%" : undefined }}
      // eslint-disable-next-line text/no-adhoc-typography -- leading-none keeps the single-letter edge chip tight against the band
      className={cn(
        "pointer-events-auto cursor-ns-resize rounded-l-sm px-xs py-2xs text-2xs font-bold leading-none text-primary-foreground shadow-sm",
        enabled ? "bg-primary" : "bg-primary/55",
      )}
    >
      {label}
    </Placed>
  );
}
