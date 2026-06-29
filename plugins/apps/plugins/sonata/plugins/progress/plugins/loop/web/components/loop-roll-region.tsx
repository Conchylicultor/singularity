import type { Projection } from "@plugins/apps/plugins/sonata/plugins/score/core";
import { useSonata } from "@plugins/apps/plugins/sonata/plugins/shell/web";
import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";

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
  // No region, or a display without a real time axis → render nothing.
  if (!loop || !beatToY) return null;

  const yA = beatToY(loop.start); // A — lower on screen (less negative)
  const yB = beatToY(loop.end); // B — higher on screen (more negative)
  const top = yB;
  const height = Math.max(0, yA - yB);

  return (
    <>
      {/* The [A, B] span: a tinted band whose top/bottom 2px borders ARE the B
          and A boundary lines (so the edges land pixel-exact on the bounds in a
          single element). A clear primary wash + solid edges while looping; a
          dashed, fill-less outline while the loop is defined-but-disabled, so an
          off loop stays legible without washing the notes. */}
      <div
        // eslint-disable-next-line layout/no-adhoc-layout -- JS pixel-positioned loop band (top/height from projection.beatToY); the border-y edges are the A/B boundary lines; spans the full lane width and scrolls with the content layer
        className={cn(
          "absolute inset-x-0 border-y-2",
          loop.enabled
            ? "border-primary bg-primary/15"
            : "border-dashed border-primary/45",
        )}
        style={{ top, height }}
      />
      {/* B label tucked just below its top edge; A label just above its bottom
          edge — both stay inside the band, clear of the lane edges. */}
      <LoopLabel y={yB} label="B" enabled={loop.enabled} side="below" />
      <LoopLabel y={yA} label="A" enabled={loop.enabled} side="above" />
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
