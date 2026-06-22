import {
  cn,
  useControlSize,
  type ControlSize,
} from "@plugins/primitives/plugins/css/plugins/ui-kit/web";

export interface BouncingDotsProps {
  className?: string;
  /**
   * `size` is intentionally never settable — the dots derive their size SOLELY
   * from ambient control density (useControlSize). Deliberate sizing is a
   * `<ControlSizeProvider size>` around the region, never a per-instance prop.
   */
  size?: never;
}

// Staggered delays give the classic left-to-right bounce wave.
const DELAYS = [0, 150, 300];

const SIZE_MAP: Record<ControlSize, string> = {
  xs: "size-1",
  sm: "size-1",
  md: "size-1.5",
  lg: "size-2",
};

export function BouncingDots({ className }: BouncingDotsProps) {
  const size = useControlSize();
  return (
    <span className={cn("flex shrink-0 items-center gap-xs", className)}>
      {DELAYS.map((delay) => (
        <span
          key={delay}
          className={cn("animate-bounce rounded-full bg-muted-foreground/40", SIZE_MAP[size])}
          style={{ animationDelay: `${delay}ms` }}
        />
      ))}
    </span>
  );
}
