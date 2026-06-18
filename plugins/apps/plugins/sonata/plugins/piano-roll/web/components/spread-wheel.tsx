import { useRef } from "react";
import { MdZoomIn } from "react-icons/md";
import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { Clip } from "@plugins/primitives/plugins/css/plugins/clip/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { WithTooltip } from "@plugins/primitives/plugins/tooltip/web";
import { useSetConfig } from "@plugins/config_v2/web";
import { useSonata } from "@plugins/apps/plugins/sonata/plugins/shell/web";
import { useInertialDrag } from "@plugins/apps/plugins/sonata/plugins/primitives/plugins/inertial-drag/web";
import { pianoRollConfig } from "../../shared/config";
import { SPREAD_MAX, SPREAD_MIN } from "./geometry";

/** Spread units per pixel of horizontal drag — a full sweep (≈240px) spans most
 *  of the [0.4, 3] range, so the wheel is precise without feeling sluggish. */
const SENSITIVITY = 0.006;

/** Zoom-style readout: 1× at the baseline, one decimal only when needed. */
const asZoom = (spread: number) => `${Math.round(spread * 10) / 10}×`;

/**
 * A horizontal jog wheel for the piano-roll vertical zoom ("spread"). Drag it
 * left/right (with release momentum, via the shared inertial-drag primitive) to
 * scrub the live `spread` the renderer reads — ephemeral transport state, so the
 * drag is a pure 60fps rescale with zero server round-trips. On settle the
 * committed value is written back to the GLOBAL `pianoRollConfig.spread` so it
 * persists across songs and reloads. The ribbed face slides with the value for a
 * physical-wheel feel; the same value is also reachable from the Settings pane
 * (the `spread` float field) and from pinch / Ctrl+scroll over the roll.
 */
export function SpreadWheel() {
  const { spread, setSpread } = useSonata();
  const setConfig = useSetConfig(pianoRollConfig);
  // The last scrubbed value, captured so the (value-less) settle callback
  // commits exactly where the fling came to rest.
  const lastValue = useRef(spread);

  const { handlers, phase } = useInertialDrag({
    axis: "x",
    unitsPerPixel: SENSITIVITY,
    bounds: [SPREAD_MIN, SPREAD_MAX],
    origin: () => spread,
    onScrub: (v) => {
      lastValue.current = v;
      setSpread(v);
    },
    onSettle: () => setConfig("spread", lastValue.current),
  });

  return (
    <WithTooltip content="Note spread — drag to zoom the falling notes">
      <Stack direction="row" align="center" gap="none" className="rounded-md border border-border">
        <MdZoomIn className="ml-2xs size-3.5 text-muted-foreground" />
        {/* The ribbed wheel face. The tick pattern + its sliding position are
            inline styles (no Tailwind spacing/radius to lint); the value-bound
            background-position makes the ribs travel as the wheel is dragged. */}
        <Clip
          {...handlers}
          role="slider"
          aria-label="Note spread"
          aria-valuemin={Math.round(SPREAD_MIN * 100)}
          aria-valuemax={Math.round(SPREAD_MAX * 100)}
          aria-valuenow={Math.round(spread * 100)}
          aria-valuetext={asZoom(spread)}
          className={cn(
            "relative h-6 w-16 touch-none select-none",
            phase === "idle" ? "cursor-ew-resize" : "cursor-grabbing",
          )}
          style={{
            backgroundImage:
              "repeating-linear-gradient(90deg, var(--border) 0 1px, transparent 1px 9px)",
            backgroundPositionX: `${spread * 48}px`,
            // Fade the ribs out at both edges so the strip reads as a wheel.
            maskImage:
              "linear-gradient(90deg, transparent, #000 25%, #000 75%, transparent)",
            WebkitMaskImage:
              "linear-gradient(90deg, transparent, #000 25%, #000 75%, transparent)",
          }}
        >
          {/* Center index mark the ribs travel past. */}
          {/* eslint-disable-next-line layout/no-adhoc-layout -- decorative center rule: horizontally centered (left-1/2 + translate) yet vertically stretched with a constant inset; not a single Pin anchor */}
          <div className="pointer-events-none absolute inset-y-1 left-1/2 w-px -translate-x-1/2 bg-primary" />
        </Clip>
        <Text
          as="span"
          variant="caption"
          className="min-w-[3rem] border-l border-border px-xs text-center font-medium tabular-nums"
        >
          {asZoom(spread)}
        </Text>
      </Stack>
    </WithTooltip>
  );
}
