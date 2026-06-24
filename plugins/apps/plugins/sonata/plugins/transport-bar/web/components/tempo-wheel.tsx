import { MdSpeed } from "react-icons/md";
import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { Clip } from "@plugins/primitives/plugins/css/plugins/clip/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { WithTooltip } from "@plugins/primitives/plugins/tooltip/web";
import { useSonata } from "@plugins/apps/plugins/sonata/plugins/shell/web";
import { useInertialDrag } from "@plugins/apps/plugins/sonata/plugins/primitives/plugins/inertial-drag/web";

/** Playback-speed bounds, as authored-tempo fractions (0% … 400%). A frozen 0%
 *  is a stopped transport; 400% is the practical ceiling the stepper also used. */
const MIN_SCALE = 0;
const MAX_SCALE = 4;

/** Tempo units (1 = 100%) per pixel of horizontal drag. Tuned so a full
 *  0%→400% sweep is a comfortable ~650px and a 5% nudge is an easy flick. Unlike
 *  the zoom wheel this scrubs in LINEAR space — tempo reaches 0%, where log-zoom
 *  would diverge — so each pixel adds a constant amount of speed, not a ratio. */
const SENSITIVITY = 0.006;

/** Pixels the ribbed face travels per unit of tempo — chosen so the ribs slide a
 *  wheel-like distance across the [0, 4] range (mirrors the zoom wheel's feel). */
const RIB_SCALE = 50;

const asPercent = (scale: number) => `${Math.round(scale * 100)}%`;

/**
 * A horizontal jog wheel for the playback speed, mirroring the piano-roll's zoom
 * `SpreadWheel`: drag it left/right (with release momentum, via the shared
 * inertial-drag primitive) to scrub the live `tempoScale`. The scrub is
 * continuous — `setTempoScale` clamps but does not quantize — so slow drags give
 * fine-grained control and the release fling coasts smoothly; the tidy 0.05 grid
 * is reserved for the ↑/↓ keyboard nudges. The ribbed face slides with the value
 * for a physical-wheel feel.
 */
export function TempoWheel() {
  const { tempoScale, setTempoScale } = useSonata();

  const { handlers, phase } = useInertialDrag({
    axis: "x",
    unitsPerPixel: SENSITIVITY,
    bounds: [MIN_SCALE, MAX_SCALE],
    origin: () => tempoScale,
    onScrub: (v) => setTempoScale(v),
  });

  return (
    <WithTooltip content="Playback speed — drag to scrub (↑/↓ to nudge)">
      <Stack direction="row" align="center" gap="none" className="rounded-md border border-border">
        <MdSpeed className="ml-2xs size-3.5 text-muted-foreground" />
        {/* The ribbed wheel face. The tick pattern + its sliding position are
            inline styles (no Tailwind spacing/radius to lint); the value-bound
            background-position makes the ribs travel as the wheel is dragged. */}
        <Clip
          {...handlers}
          role="slider"
          aria-label="Playback speed"
          aria-valuemin={Math.round(MIN_SCALE * 100)}
          aria-valuemax={Math.round(MAX_SCALE * 100)}
          aria-valuenow={Math.round(tempoScale * 100)}
          aria-valuetext={asPercent(tempoScale)}
          className={cn(
            "relative h-6 w-16 touch-none select-none",
            phase === "idle" ? "cursor-ew-resize" : "cursor-grabbing",
          )}
          style={{
            backgroundImage:
              "repeating-linear-gradient(90deg, var(--border) 0 1px, transparent 1px 9px)",
            // Position tracks the linear tempo so the ribs travel at a constant
            // rate across the whole range (matching the linear-space drag).
            backgroundPositionX: `${tempoScale * RIB_SCALE}px`,
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
          {asPercent(tempoScale)}
        </Text>
      </Stack>
    </WithTooltip>
  );
}
