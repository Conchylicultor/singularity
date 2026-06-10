import { cn } from "@/lib/utils";
import type React from "react";

export type BadgeVariant =
  | "muted"
  | "primary"
  | "warning"
  | "destructive"
  | "success"
  | "info";
export type BadgeSize = "sm" | "md";

const VARIANT_CLASS: Record<BadgeVariant, string> = {
  muted: "bg-muted text-muted-foreground",
  primary: "bg-primary/15 text-primary",
  warning: "bg-warning/15 text-warning",
  destructive: "bg-destructive/15 text-destructive",
  success: "bg-success/15 text-success",
  info: "bg-info/15 text-info",
};

export interface BadgeProps {
  /** Semantic color variant. Default "muted". Ignored when `colorClass` is set. */
  variant?: BadgeVariant;
  /** Size token. sm → text-3xs, md → text-xs. Default "md". */
  size?: BadgeSize;
  /** Color-only escape hatch: replaces the variant bg/text classes (map-driven colors). */
  colorClass?: string;
  /** Leading icon or StatusDot, rendered before children. */
  icon?: React.ReactNode;
  /** Element to render. Default "span"; pass "button" for interactive badges. */
  as?: React.ElementType;
  className?: string;
  title?: string;
  children: React.ReactNode;
  /** Permissive passthrough for the rendered element (onClick, type, disabled, …). */
  [key: string]: unknown;
}

export function Badge({
  variant = "muted",
  size = "md",
  colorClass,
  icon,
  as: As = "span",
  className,
  children,
  ...rest
}: BadgeProps) {
  return (
    <As
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-md p-chip font-medium tabular-nums [&_svg:not([class*='size-'])]:icon-auto",
        size === "sm" && "text-3xs",
        size === "md" && "text-xs",
        colorClass ?? VARIANT_CLASS[variant],
        className,
      )}
      {...rest}
    >
      {icon}
      {children}
    </As>
  );
}
