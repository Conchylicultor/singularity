import { cn } from "@plugins/primitives/plugins/ui-kit/web";

export interface StatusDotProps {
  colorClass: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function StatusDot({ colorClass, size = "sm", className }: StatusDotProps) {
  return (
    <span
      className={cn(
        "shrink-0 rounded-full",
        size === "sm" && "size-1.5",
        size === "md" && "size-2",
        size === "lg" && "size-2.5",
        colorClass,
        className,
      )}
    />
  );
}
