import {
  cn,
  ControlSizeProvider,
  type ControlSize,
} from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { Line } from "@plugins/primitives/plugins/css/plugins/line/web";
import type { ElementType, HTMLAttributes } from "react";

export type BarTier = "chrome" | "pane";

export interface BarProps extends HTMLAttributes<HTMLElement> {
  /**
   * Which chrome tier this bar belongs to.
   * - `"chrome"` (default): the app/pane **toolbar** tier — a `<header>` at
   *   `h-chrome-bar`, `pl-chrome`, masked with `bg-chrome-mask` (the surface it
   *   sits on, page canvas by default). Reserves the floating-bar safe area by
   *   default (`endSafeArea`). Used by the app-shell toolbar and pane-toolbar host.
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
  /**
   * Reserve the floating-action-bar safe area on the right (`pr-floating-bar`).
   * Defaults on for `chrome` (unchanged behavior), off for `pane`. The pane
   * tier opts in when its header IS the surface's top chrome and sits at the
   * right edge, so the global floating bar doesn't occlude its actions.
   */
  endSafeArea?: boolean;
  /**
   * The control density declared for everything inside this bar; defaults to
   * `"sm"` (the chrome tier). Innermost provider wins, so a child region/slot
   * may override.
   */
  controlSize?: ControlSize;
}

/** Per-tier chrome: height token, horizontal inset, and (chrome only) the mask. */
const TIER_CLASS: Record<BarTier, string> = {
  chrome: "h-chrome-bar pl-chrome bg-chrome-mask",
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
  endSafeArea,
  controlSize = "sm",
  className,
  children,
  ...rest
}: BarProps) {
  const As = as ?? TIER_ELEMENT[tier];
  const safe = endSafeArea ?? tier === "chrome";
  return (
    // The single-line contract (region-line + SingleLineProvider) comes from
    // <Line>; Bar layers its strip chrome (border, tier height/inset, clip) on top.
    <Line
      as={As}
      // eslint-disable-next-line layout/no-adhoc-layout -- Bar is the sanctioned single-line chrome-strip primitive (enforced by bar/no-adhoc-bar); it owns its own raw min-w-0 + clip mechanics, the same way the css/* layout primitives own theirs
      className={cn(
        "gap-sm border-b",
        TIER_CLASS[tier],
        safe && "pr-floating-bar",
        overflow === "visible" ? "overflow-visible" : "overflow-hidden",
        className,
      )}
      {...rest}
    >
      <ControlSizeProvider size={controlSize}>{children}</ControlSizeProvider>
    </Line>
  );
}
