import type { Projection } from "@plugins/apps/plugins/sonata/plugins/score/core";
import {
  useLaneInsets,
  useSonata,
} from "@plugins/apps/plugins/sonata/plugins/shell/web";
import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { Inline } from "@plugins/primitives/plugins/css/plugins/inline/web";
import { Pin } from "@plugins/primitives/plugins/css/plugins/pin/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { MdKeyboardArrowDown, MdKeyboardArrowUp } from "react-icons/md";
import { useLoopEdgeBuckets, type LoopEdgeLetter } from "../loop-edge-state";

/**
 * The off-screen A–B loop boundary indicator: a small "A"/"B" arrow chip pinned
 * to the lane's top or bottom edge, pointing toward a loop boundary that has
 * scrolled past the lookahead. At default zoom the loop is taller than the
 * ~2.5s lookahead, so usually only one boundary is on-screen (B/end off the
 * top; A/start off the bottom while looping) — this keeps the off-screen edge
 * legible without scrolling. View-only; mounted OUTSIDE the scroll layer (via
 * the screen-anchored {@link Sonata.TransportEdge} slot) so the chips stay
 * pinned at the edge instead of falling with the notes. Mutually exclusive with
 * `LoopRollRegion`'s content-space letter labels — a boundary is either
 * on-screen (label shows) or off-screen (this chip shows), never both.
 *
 * Mirrors the band's `LoopLabel` chip styling (primary tint, faded while the
 * loop is defined-but-disabled) so the same loop reads as the same thing.
 */
export function LoopRollEdge({ projection }: { projection: Projection }) {
  const { loop } = useSonata();
  const { top, bottom } = useLoopEdgeBuckets(projection);
  const { top: topInset } = useLaneInsets();
  if (!loop) return null;
  if (top.length === 0 && bottom.length === 0) return null;

  return (
    <>
      {top.length > 0 ? (
        // eslint-disable-next-line layout/no-adhoc-layout -- screen-anchored loop-edge chip cluster pinned to the lane top edge at a runtime topInset (HUD-reserved) px
        <Stack gap="2xs" align="end" className="absolute right-0" style={{ top: topInset }}>
          {top.map((letter) => (
            <EdgeChip
              key={letter}
              letter={letter}
              direction="up"
              enabled={loop.enabled}
            />
          ))}
        </Stack>
      ) : null}
      {bottom.length > 0 ? (
        <Pin to="bottom-right" offset="none" decorative>
          <Stack gap="2xs" align="end">
            {bottom.map((letter) => (
              <EdgeChip
                key={letter}
                letter={letter}
                direction="down"
                enabled={loop.enabled}
              />
            ))}
          </Stack>
        </Pin>
      ) : null}
    </>
  );
}

/**
 * A single off-screen loop-boundary chip ("A" / "B"), an arrow pointing toward
 * the off-screen edge followed by the letter. Reuses `LoopLabel`'s pill styling;
 * `enabled` fades it with the loop's enabled state. Pointer-transparent.
 */
function EdgeChip({
  letter,
  direction,
  enabled,
}: {
  letter: LoopEdgeLetter;
  direction: "up" | "down";
  enabled: boolean;
}) {
  const Arrow = direction === "up" ? MdKeyboardArrowUp : MdKeyboardArrowDown;
  return (
    <div
      // eslint-disable-next-line text/no-adhoc-typography -- text-2xs sub-scale keeps the single-letter loop-edge chip tight (mirrors LoopLabel)
      className={cn(
        "pointer-events-none rounded-l-sm px-xs py-2xs text-2xs font-bold leading-none text-primary-foreground shadow-sm",
        enabled ? "bg-primary" : "bg-primary/55",
      )}
    >
      <Inline gap="2xs">
        <Arrow className="icon-auto" />
        {letter}
      </Inline>
    </div>
  );
}
