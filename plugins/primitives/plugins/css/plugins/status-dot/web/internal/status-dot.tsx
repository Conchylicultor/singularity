import {
  cn,
  useControlSize,
  type ControlSize,
  type DensityControlled,
} from "@plugins/primitives/plugins/css/plugins/ui-kit/web";

export interface StatusDotProps extends DensityControlled {
  colorClass: string;
  className?: string;
}

const SIZE_MAP: Record<ControlSize, string> = {
  xs: "size-1",
  sm: "size-1.5",
  md: "size-2",
  lg: "size-2.5",
};

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
 */
export function StatusDot({ colorClass, className }: StatusDotProps) {
  const size = useControlSize();
  return (
    <span
      className={cn(
        "inline-block shrink-0 rounded-full align-middle",
        SIZE_MAP[size],
        colorClass,
        className,
      )}
    />
  );
}
