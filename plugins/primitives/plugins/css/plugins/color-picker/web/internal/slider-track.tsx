import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import {
  Placed,
  pct,
} from "@plugins/primitives/plugins/css/plugins/coords/web";
import { useRef, type CSSProperties, type ReactNode } from "react";
import { useColorDrag } from "./use-color-drag";

/**
 * The round handle of the area and the sliders, FILLED with the color it
 * holds, so the thumb shows its value. White rim + dark ring: the rim must
 * read on any color beneath it, in either theme, so it is not a theme token.
 */
export function Thumb({ x, y, fill }: { x: number; y: number; fill: string }) {
  return (
    <Placed
      x={{ center: pct(x) }}
      y={{ center: pct(y) }}
      decorative
      className="size-4 rounded-full border-2 border-white shadow-sm ring-1 ring-black/40"
      style={{ background: fill }}
    />
  );
}

/** The keys that move a 1-D slider, and which way. */
const STEP_KEYS: Record<string, number> = {
  ArrowRight: 1,
  ArrowUp: 1,
  ArrowLeft: -1,
  ArrowDown: -1,
};

export interface SliderTrackProps {
  /** Thumb position, 0..1. */
  position: number;
  /** Pointer at `x` (0..1 of the track). */
  onDrag: (x: number) => void;
  /** Arrow key: `direction` ±1, `big` with Shift (×10). */
  onStep: (direction: 1 | -1, big: boolean) => void;
  /** A drag released, or an arrow key let go. */
  onCommit?: () => void;
  label: string;
  valueNow: number;
  valueMin: number;
  valueMax: number;
  valueText: string;
  thumbFill: string;
  /** The track's painted background (gradient). */
  background: CSSProperties;
  /** Painted over `background` (alpha's color ramp over its checkerboard). */
  overlay?: ReactNode;
  className?: string;
}

/**
 * A horizontal color slider — hue, opacity: a gradient track with a filled
 * thumb, dragged with the pointer or stepped with the arrow keys (Shift ×10).
 */
export function SliderTrack({
  position,
  onDrag,
  onStep,
  onCommit,
  label,
  valueNow,
  valueMin,
  valueMax,
  valueText,
  thumbFill,
  background,
  overlay,
  className,
}: SliderTrackProps) {
  const ref = useRef<HTMLDivElement>(null);
  const { onPointerDown } = useColorDrag(ref, (x) => onDrag(x), onCommit);

  return (
    <div
      ref={ref}
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-valuenow={valueNow}
      aria-valuemin={valueMin}
      aria-valuemax={valueMax}
      aria-valuetext={valueText}
      aria-orientation="horizontal"
      onPointerDown={onPointerDown}
      onKeyDown={(e) => {
        const d = STEP_KEYS[e.key];
        if (d === undefined) return;
        e.preventDefault();
        onStep(d > 0 ? 1 : -1, e.shiftKey);
      }}
      onKeyUp={(e) => {
        if (STEP_KEYS[e.key] !== undefined) onCommit?.();
      }}
      className={cn(
        "relative h-4 cursor-pointer touch-none rounded-full outline-none",
        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background",
        className,
      )}
      style={background}
    >
      {overlay}
      <Thumb x={position} y={0.5} fill={thumbFill} />
    </div>
  );
}
