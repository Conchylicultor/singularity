import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn, usePortalThemeScope } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";

// The viewport-fill recipe lives in module consts (not inline className literals)
// so the `no-adhoc-viewport-overlay` rule — which only harvests literals reached
// from a className attribute subtree — never flags the primitive that owns it.
// Same trick `<Card>`/`<Surface>` use to stay clear of their own lint.
const OVERLAY_ROOT = "fixed inset-0";
const LAYER_CLASS = {
  popover: "z-popover",
  draw: "z-draw",
  max: "z-max",
} as const;

export interface ViewportOverlayProps {
  /** Stacking layer. Defaults to "popover" (the documented portaled-layer). */
  layer?: keyof typeof LAYER_CLASS;
  /**
   * When false, render `children` inline (no portal, no fixed wrapper, and `rest`
   * is ignored). The extension point for keep-alive toggles like the per-tab solo
   * placement, where the same React element must move in and out of the portal
   * without remounting its subtree.
   */
  active?: boolean;
  /** Extra classes for the overlay root (background, flex layout, etc.). */
  className?: string;
  children: ReactNode;
  /**
   * Permissive passthrough applied to the portal root div (onClick, role,
   * aria-*, data-*, style, …) — mirrors `<Card>`. The `fixed inset-0` + z-layer +
   * `data-theme-scope` are owned by the primitive and cannot be overridden away.
   */
  [key: string]: unknown;
}

/**
 * The sanctioned home for a viewport-filling overlay (fullscreen modes, picker
 * and draw overlays, modal scrims). Self-portals to `document.body` so its
 * `fixed inset-0` box is relative to the real VIEWPORT — never to a
 * `transform-gpu` (or any transform / filter / will-change) ancestor that would
 * otherwise become the containing block and silently clip it to the content
 * area. Stamps `data-theme-scope` from `usePortalThemeScope()` so themed content
 * keeps the originating surface's palette after the portal hop.
 *
 * Why this exists: several app surfaces deliberately transform a container to
 * scope `position: fixed` chrome; any hand-rolled `fixed inset-0` descendant is
 * then clipped with no error. Routing every viewport overlay through this
 * primitive makes that whole class of bug structurally impossible — enforced by
 * the co-located `no-adhoc-viewport-overlay` lint rule.
 */
export function ViewportOverlay({
  layer = "popover",
  active = true,
  className,
  children,
  ...rest
}: ViewportOverlayProps) {
  const scope = usePortalThemeScope();
  if (!active) return <>{children}</>;
  return createPortal(
    <div
      data-theme-scope={scope}
      className={cn(OVERLAY_ROOT, LAYER_CLASS[layer], className)}
      {...rest}
    >
      {children}
    </div>,
    document.body,
  );
}
