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

export function StatusDot({ colorClass, className }: StatusDotProps) {
  const size = useControlSize();
  return (
    <span
      className={cn("shrink-0 rounded-full", SIZE_MAP[size], colorClass, className)}
    />
  );
}
