import {
  cn,
  useControlSize,
  textStepFor,
  type DensityControlled,
} from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import type { BadgeVariant } from "../../core";
import type { Passthrough } from "@plugins/primitives/plugins/passthrough/core";
import { copiesAsOwnText } from "@plugins/primitives/plugins/dom/plugins/copy-source-text/core";
import type React from "react";

// Re-exported so every existing `import { BadgeVariant } from ".../badge/web"`
// keeps working: the name lives in `core` (a data declaration in another
// plugin's `core` has to be able to spell it), the classes live here.
export type { BadgeVariant };

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

/**
 * A badge renders TWO elements — the chip shell and the truncating label span
 * inside it. `ref` and everything spread beside it land on the SHELL, the outer
 * one: it is the chip as far as a caller is concerned, and the inner span is an
 * implementation detail of how a long label ellipsizes. See {@link Passthrough}.
 */
export interface BadgeProps extends DensityControlled, Passthrough {
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
  const textClass = textStepFor(density)
    ? "text-caption-compact"
    : "text-caption";
  return (
    <As
      className={cn(
        // The chip shell, shared by every chip role (LinkChip/ToggleChip compose this).
        // region-line = items-center + whitespace-nowrap (the single-line invariant).
        // max-w-full + the inner truncate span make a chip a well-behaved content leaf:
        // a long label ellipsizes instead of overflowing. align-baseline puts the chip
        // on the baseline of a sentence holding it — and the label's own `self-baseline`
        // below decides WHICH baseline the chip offers the sentence.
        "inline-flex region-line max-w-full gap-xs p-chip align-baseline font-medium tabular-nums [&_svg:not([class*='size-'])]:icon-auto",
        shape === "rect" && "rounded-md",
        shape === "pill" && "rounded-full",
        textClass,
        colorClass ?? VARIANT_CLASS[variant],
        className,
      )}
      // A badge's label sits in the truncating span below, which is a flex item
      // — and CSS blockifies every flex item. The clipboard's plain-text
      // serializer puts a newline before and after every block-level box, so a
      // badge in running text copies as three lines. Declaring the badge as
      // copying its own text collapses it back to one, without touching the box
      // model the truncation depends on. Placed BEFORE the passthrough so a
      // caller standing in for something else (an active-data chip declaring its
      // source token) overrides it rather than fighting it.
      {...copiesAsOwnText}
      {...rest}
    >
      {icon}
      {/*
       * `self-baseline` on the LABEL is what makes the shell's `align-baseline`
       * mean anything, and it is the only line here that decides where a chip
       * sits in a sentence.
       *
       * An inline-flex box does not have a baseline of its own — it hands the
       * line the baseline of its FIRST flex item. The first item here is the
       * leading icon, and an SVG's baseline is its bottom edge. So a chip in
       * running text used to hang its icon's bottom edge off the sentence's
       * baseline, which carried the label about 3.5px higher than the words
       * beside it and pushed the whole line taller to make room. Every chip in
       * a paragraph read as floating.
       *
       * Marking the label as the one baseline-aligned item makes the chip offer
       * up its label's own text baseline instead, so the label sits on the
       * sentence's baseline like a word. The icon still takes region-line's
       * `items-center`, so it stays centred on the label, and the chip's box is
       * exactly the size it was.
       */}
      <span className={cn("truncate self-baseline", mono && "font-mono")}>
        {children}
      </span>
    </As>
  );
}
