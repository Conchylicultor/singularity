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
import { SPREAD_MIN } from "./geometry";

/** Log-zoom units per pixel of horizontal drag. The wheel scrubs `log(spread)`,
 *  so each pixel multiplies the zoom by a CONSTANT ratio (exp(SENSITIVITY)) no
 *  matter where you are in the range — the standard log-scale zoom feel. Tuned so
 *  a ~200px sweep is ≈2.7× and the default [0.4, 3] band spans a comfortable
 *  ~400px. A wider range (long-song fit) just makes the sweep proportionally
 *  longer — the per-pixel feel never changes. */
const SENSITIVITY = 0.005;

/** Pixels the ribbed face travels per natural-log unit of zoom — chosen so the
 *  ribs slide a wheel-like distance across the default range. */
const RIB_SCALE = 60;

/** Zoom-style readout: one decimal at/above 1×, two below (so a deep fit-zoom
 *  like 0.05× still reads precisely rather than rounding to 0×). */
const asZoom = (spread: number) =>
  spread >= 1
    ? `${Math.round(spread * 10) / 10}×`
    : `${Math.round(spread * 100) / 100}×`;

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
  const { spread, spreadMin, spreadMax, setSpread } = useSonata();
  const setConfig = useSetConfig(pianoRollConfig);
  // The last scrubbed value, captured so the (value-less) settle callback
  // commits exactly where the fling came to rest.
  const lastValue = useRef(spread);

  // Scrub in LOG space: the drag value is `log(spread)`, so a fixed pixel travel
  // is a fixed zoom RATIO across the whole (dynamic) range — uniform control
  // whether nudging 1.0×→1.1× or pulling a long song all the way out to fit.
  const { handlers, phase } = useInertialDrag({
    axis: "x",
    unitsPerPixel: SENSITIVITY,
    bounds: [Math.log(spreadMin), Math.log(spreadMax)],
    origin: () => Math.log(spread),
    onScrub: (logV) => {
      const v = Math.exp(logV);
      lastValue.current = v;
      setSpread(v);
    },
    // A sub-default fit-zoom is a transient per-song view, not a saved note-size
    // preference — only in-range values write back to the global config.
    onSettle: () => {
      if (lastValue.current >= SPREAD_MIN) {
        setConfig("spread", lastValue.current);
      }
    },
  });

  return (
    <WithTooltip content="Note spread — drag to zoom; pull left to fit the whole song">
      <Stack direction="row" align="center" gap="none" className="rounded-md border border-border">
        <MdZoomIn className="ml-2xs size-3.5 text-muted-foreground" />
        {/* The ribbed wheel face. The tick pattern + its sliding position are
            inline styles (no Tailwind spacing/radius to lint); the value-bound
            background-position makes the ribs travel as the wheel is dragged. */}
        <Clip
          {...handlers}
          role="slider"
          aria-label="Note spread"
          aria-valuemin={Math.round(spreadMin * 100)}
          aria-valuemax={Math.round(spreadMax * 100)}
          aria-valuenow={Math.round(spread * 100)}
          aria-valuetext={asZoom(spread)}
          className={cn(
            "relative h-6 w-16 touch-none select-none",
            phase === "idle" ? "cursor-ew-resize" : "cursor-grabbing",
          )}
          style={{
            backgroundImage:
              "repeating-linear-gradient(90deg, var(--border) 0 1px, transparent 1px 9px)",
            // Position tracks log(spread) so the ribs travel uniformly per zoom
            // ratio (matching the log-space drag), not faster at high zoom.
            backgroundPositionX: `${Math.log(spread) * RIB_SCALE}px`,
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
