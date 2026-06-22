import {
  cn,
  useControlSize,
  textStepFor,
} from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import type React from "react";

export type BadgeVariant =
  | "muted"
  | "primary"
  | "warning"
  | "destructive"
  | "success"
  | "info";
/** Corner treatment. "rect" = status-label rounded rectangle; "pill" = filter/toggle pill. */
export type BadgeShape = "rect" | "pill";

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
  /** Corner treatment. Default "rect" (rounded rectangle); "pill" → fully rounded. */
  shape?: BadgeShape;
  /** Color-only escape hatch: replaces the variant bg/text classes (map-driven colors). */
  colorClass?: string;
  /** Leading icon or StatusDot, rendered before the label (stays rigid; never truncates). */
  icon?: React.ReactNode;
  /** Monospace label (for ids). Applies font-mono to the label wrapper. */
  mono?: boolean;
  /** Element to render. Default "span"; pass "button" for interactive badges. */
  as?: React.ElementType;
  className?: string;
  title?: string;
  children: React.ReactNode;
  /**
   * `size` is intentionally never settable — a chip derives its text size SOLELY
   * from ambient control density (useControlSize). The index signature below would
   * otherwise let a stray `size` through; typing it as `never` makes passing one a
   * compile error.
   */
  size?: never;
  /** Permissive passthrough for the rendered element (onClick, type, disabled, …). */
  [key: string]: unknown;
}

export function Badge({
  variant = "muted",
  shape = "rect",
  colorClass,
  icon,
  mono,
  as: As = "span",
  className,
  children,
  ...rest
}: BadgeProps) {
  const density = useControlSize();
  // Text size tracks ambient control density via the single density→text policy
  // (textStepFor, shared with Button + Text): the compact `xs` density drops one
  // rung to text-caption-compact; every other density (incl. the no-provider
  // default "md") reads text-caption.
  const textClass = textStepFor(density) ? "text-caption-compact" : "text-caption";
  return (
    <As
      className={cn(
        // The chip shell, shared by every chip role (LinkChip/ToggleChip compose this).
        // region-line = items-center + whitespace-nowrap (the single-line invariant).
        // max-w-full + the inner truncate span make a chip a well-behaved content leaf:
        // a long label ellipsizes instead of overflowing. align-baseline is free on flex
        // children and correct when a chip sits inline in running text.
        "inline-flex region-line max-w-full gap-xs p-chip align-baseline font-medium tabular-nums [&_svg:not([class*='size-'])]:icon-auto",
        shape === "rect" && "rounded-md",
        shape === "pill" && "rounded-full",
        textClass,
        colorClass ?? VARIANT_CLASS[variant],
        className,
      )}
      {...rest}
    >
      {icon}
      <span className={cn("truncate", mono && "font-mono")}>{children}</span>
    </As>
  );
}
