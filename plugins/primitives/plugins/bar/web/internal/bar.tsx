import { cn } from "@plugins/primitives/plugins/ui-kit/web";
import type { ElementType, HTMLAttributes } from "react";

export type BarTier = "chrome" | "pane";

export interface BarProps extends HTMLAttributes<HTMLElement> {
  /**
   * Which chrome tier this bar belongs to.
   * - `"chrome"` (default): the app/pane **toolbar** tier — a `<header>` at
   *   `h-chrome-bar`, `pl-chrome` + `pr-floating-bar` (clears the floating action
   *   bar) on `bg-background`. Used by the app-shell toolbar and pane-toolbar host.
   * - `"pane"`: the **pane-header** tier — a `<div>` at the shorter `h-chrome-pane`
   *   with symmetric `px-chrome` and `min-w-0` (truncation-safe). Used by PaneChrome.
   */
  tier?: BarTier;
  /**
   * `"hidden"` (default) clips a too-wide single line. `"visible"` lets a
   * title-area child (e.g. CollapsibleWrap) spill expanded rows DOWN over the
   * content below instead of being clipped (PaneChrome's `headerSpill`).
   */
  overflow?: "hidden" | "visible";
  /** Element override; defaults to the tier's semantic element (`header`/`div`). */
  as?: ElementType;
}

/** Per-tier chrome: height token, horizontal inset, and (chrome only) the bg + floating-bar safe area. */
const TIER_CLASS: Record<BarTier, string> = {
  chrome: "h-chrome-bar pl-chrome pr-floating-bar bg-background",
  pane: "h-chrome-pane px-chrome min-w-0",
};

const TIER_ELEMENT: Record<BarTier, ElementType> = {
  chrome: "header",
  pane: "div",
};

/**
 * The single-line chrome-strip primitive — the horizontal toolbar/header band
 * shared by the app-shell toolbar, the pane-toolbar host, and pane headers.
 *
 * Bar owns ONLY the strip chrome (the flex row, the single-line invariant via
 * `region-line`, the bottom border, the tier height + inset, and clipping). It
 * has no slots and hosts no content of its own: each consumer composes `<Bar>`
 * and supplies what it hosts (sidebar trigger, reorderable start/end zones,
 * title + promote + close, …). This is the factor-not-collapse boundary — a
 * bar, a row, and a chip stay distinct primitives; only the single-line region
 * invariant (`region-line`) is shared between them.
 *
 * Hand-rolling this strip is banned by `bar/no-adhoc-bar`.
 */
export function Bar({
  tier = "chrome",
  overflow = "hidden",
  as,
  className,
  children,
  ...rest
}: BarProps) {
  const As = as ?? TIER_ELEMENT[tier];
  return (
    <As
      className={cn(
        "flex region-line gap-sm border-b",
        TIER_CLASS[tier],
        overflow === "visible" ? "overflow-visible" : "overflow-hidden",
        className,
      )}
      {...rest}
    >
      {children}
    </As>
  );
}
