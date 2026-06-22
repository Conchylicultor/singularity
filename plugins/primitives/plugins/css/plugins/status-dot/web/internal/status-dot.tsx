import {
  cn,
  useControlSize,
  type ControlSize,
} from "@plugins/primitives/plugins/css/plugins/ui-kit/web";

export interface StatusDotProps {
  colorClass: string;
  className?: string;
  /**
   * `size` is intentionally never settable — the dot derives its size SOLELY
   * from ambient control density (useControlSize). Deliberate sizing is a
   * `<ControlSizeProvider size>` around the region, never a per-instance prop.
   */
  size?: never;
}

const SIZE_MAP: Record<ControlSize, string> = {
  xs: "size-1",
  sm: "size-1.5",
  md: "size-2",
  lg: "size-2.5",
};

export function StatusDot({ colorClass, className }: StatusDotProps) {
  const size = useControlSize();
  return (
    <span
      className={cn("shrink-0 rounded-full", SIZE_MAP[size], colorClass, className)}
    />
  );
}
