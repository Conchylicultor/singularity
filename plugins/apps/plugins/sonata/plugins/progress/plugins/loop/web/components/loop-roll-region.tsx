import type { Projection } from "@plugins/apps/plugins/sonata/plugins/score/core";
import { useSonata } from "@plugins/apps/plugins/sonata/plugins/shell/web";
import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { useLoopEdgeBuckets } from "../loop-edge-state";

/**
 * The A–B practice loop, surfaced on the piano roll's falling-note timeline: a
 * band spanning `[A, B]` with a boundary line + letter label at each edge,
 * anchored to the time axis via the published `projection` and rendered inside
 * the display's scroll layer — so it scrolls glued to the notes (A/B fall toward
 * the now-line exactly as the music reaches them). View-only: dragging the
 * bounds stays on the progression bar, and the lane overlay layer is
 * pointer-transparent.
 *
 * Mirrors the progress-bar `LoopRegion`'s visual language (primary tint + ring;
 * faded / outline-only while disabled) so the same loop reads as the same thing
 * on both surfaces.
 *
 * Beat → Y projection: `projection.beatToY` is CONTENT-space and negative for
 * positive beats (future = more negative = higher up). `B` (end) is further in
 * the future than `A` (start), so `beatToY(end) < beatToY(start)`: the band's
 * top is `beatToY(end)` and its height is `beatToY(start) - beatToY(end)`.
 */
export function LoopRollRegion({ projection }: { projection: Projection }) {
  const { loop } = useSonata();
  const beatToY = projection.beatToY;
  // Which boundaries have scrolled off-screen (so their content-space label is
  // hidden — the screen-anchored edge chip stands in for it). Called BEFORE the
  // early return so hook order stays stable; it early-returns empty internally
  // when there's no loop / time axis.
  const { top: edgeTop, bottom: edgeBottom } = useLoopEdgeBuckets(projection);
  // No region, or a display without a real time axis → render nothing.
  if (!loop || !beatToY) return null;

  const yA = beatToY(loop.start); // A — lower on screen (less negative)
  const yB = beatToY(loop.end); // B — higher on screen (more negative)
  const top = yB;
  const height = Math.max(0, yA - yB);

  // A boundary is on-screen iff it's in neither edge bucket → show its label.
  const aOn = !edgeTop.includes("A") && !edgeBottom.includes("A");
  const bOn = !edgeTop.includes("B") && !edgeBottom.includes("B");

  return (
    <>
      {/* The [A, B] span, drawn as a TRANSPARENT outline — no fill, since a wash
          over the falling notes reads as distracting. The 2px border frames the
          region: the left/right edges are the "inside a loop" side rails, and the
          top/bottom edges are the B and A boundary lines (pixel-exact on the
          bounds, all in one element). Solid while looping; dashed while the loop
          is defined-but-disabled. */}
      <div
        // eslint-disable-next-line layout/no-adhoc-layout -- JS pixel-positioned loop band (top/height from projection.beatToY); the border edges are the side rails + A/B boundary lines; spans the full lane width and scrolls with the content layer
        className={cn(
          "absolute inset-x-0 border-2",
          loop.enabled
            ? "border-primary"
            : "border-dashed border-primary/45",
        )}
        style={{ top, height }}
      />
      {/* B label tucked just below its top edge; A label just above its bottom
          edge — both stay inside the band, clear of the lane edges. Each shows
          only while its boundary is on-screen; once a boundary scrolls past the
          lookahead the edge chip (LoopRollEdge) stands in for the label. */}
      {bOn ? <LoopLabel y={yB} label="B" enabled={loop.enabled} side="below" /> : null}
      {aOn ? <LoopLabel y={yA} label="A" enabled={loop.enabled} side="above" /> : null}
    </>
  );
}

/**
 * A loop-boundary letter chip ("A" / "B"), pinned to the right edge at its
 * content-space `y` and offset just inside the band (`below` the top edge, or
 * `above` the bottom edge). Fades with the loop's enabled state.
 */
function LoopLabel({
  y,
  label,
  enabled,
  side,
}: {
  y: number;
  label: string;
  enabled: boolean;
  side: "above" | "below";
}) {
  return (
    <div
      // eslint-disable-next-line layout/no-adhoc-layout, text/no-adhoc-typography -- compact loop-edge chip pinned to the right edge at a runtime content-space Y (top from projection.beatToY); translate keeps it just inside the band; text-2xs sub-scale keeps the single letter tight
      className={cn(
        "absolute right-0 rounded-l-sm px-xs py-2xs text-2xs font-bold leading-none text-primary-foreground shadow-sm",
        side === "above" ? "-translate-y-full" : null,
        enabled ? "bg-primary" : "bg-primary/55",
      )}
      style={{ top: y }}
    >
      {label}
    </div>
  );
}
