import {
  cn,
  useControlSize,
  type ControlSize,
  type DensityControlled,
} from "@plugins/primitives/plugins/css/plugins/ui-kit/web";

/**
 * How a dot is painted — exactly one of two arms:
 *
 * - **`{ colorClass }`** — a FILLED dot: the class paints its background
 *   (`bg-success`, `bg-warning/40`, …).
 * - **`{ ringClass }`** — a HOLLOW dot: a 1px ring with a transparent centre;
 *   the class paints the ring (`border-muted-foreground`, …). A status that is
 *   not live (not started yet, finished, gone) reads as an outline beside the
 *   filled dots of the ones that are.
 *
 * A union, not two optional props, so a dot that is both or neither does not
 * compile. It is also the shape a status vocabulary maps to (a
 * `Record<Status, StatusDotPaint>`), spread straight onto `<StatusDot>`.
 */
export type StatusDotPaint =
  | { colorClass: string; ringClass?: never }
  | { ringClass: string; colorClass?: never };

export type StatusDotProps = DensityControlled &
  StatusDotPaint & {
    className?: string;
  };

/** Diameter per density tier: the density token group's `--status-dot-*`. */
const SIZE_MAP: Record<ControlSize, string> = {
  xs: "size-status-dot-xs",
  sm: "size-status-dot-sm",
  md: "size-status-dot-md",
  lg: "size-status-dot-lg",
};

/**
 * The classes that paint `paint` onto a dot-shaped element: the fill, or a 1px
 * transparent-centred ring. For a surface that draws its own dot element (an
 * avatar's presence overlay) and must read the same status vocabulary as
 * `StatusDot`.
 */
export function statusDotPaintClass(paint: StatusDotPaint): string {
  return paint.ringClass != null
    ? cn("border bg-transparent", paint.ringClass)
    : paint.colorClass;
}

/**
 * `inline-block` is what makes the size real everywhere.
 *
 * A dot has no content, so as a plain inline box its width and height are
 * ignored and it renders as nothing at all — which is exactly what happened
 * beside a chip's label, where the dot sits in the badge's truncating text span
 * rather than in a flex row. Every visible use happened to land in a flex
 * container, which blockifies the box and gives it back its size, so the failure
 * only showed up where a caller composed it into running text. Declaring the
 * box here means the dot carries its own size into either context (a flex or
 * grid item blockifies `inline-block` → `block`, so nothing changes for the
 * callers that already worked), and `align-middle` centres it on the text it
 * follows instead of hanging it off the baseline.
 *
 * A hollow dot's ring is drawn INSIDE its diameter (border-box), so a ring and
 * a filled dot at one density are the same size.
 */
export function StatusDot(props: StatusDotProps) {
  const size = useControlSize();
  return (
    <span
      className={cn(
        "inline-block shrink-0 rounded-full align-middle",
        SIZE_MAP[size],
        statusDotPaintClass(props),
        props.className,
      )}
    />
  );
}
