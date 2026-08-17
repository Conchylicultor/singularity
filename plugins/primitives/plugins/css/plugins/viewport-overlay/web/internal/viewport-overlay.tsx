import { useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  cn,
  usePortalForwardedAttrs,
} from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import {
  type PortaledLayer,
  zLayerClass,
} from "@plugins/primitives/plugins/css/plugins/z-layers/web";
import { useViewportEscape } from "./use-viewport-escape";

// The viewport-fill recipe lives in a module const (not an inline className
// literal) so the `no-adhoc-viewport-overlay` rule — which only harvests literals
// reached from a className attribute subtree — never flags the primitive that
// owns it. Same trick `<Card>`/`<Surface>` use to stay clear of their own lint.
const OVERLAY_ROOT = "fixed inset-0";

export interface ViewportOverlayProps {
  /** Stacking layer. Defaults to "popover" (the documented portaled-layer). */
  layer?: PortaledLayer;
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
 * area. Re-stamps the portal-forwarded `data-*` bag (theme scope, plugin
 * lineage, pane id) via `usePortalForwardedAttrs()` so ancestry-derived signals
 * survive the portal hop — themed content keeps the originating surface's palette
 * and the element-picker still resolves the owning plugin.
 *
 * Why this exists: several app surfaces deliberately transform a container to
 * scope `position: fixed` chrome; any hand-rolled `fixed inset-0` descendant is
 * then clipped with no error. Routing every viewport overlay through this
 * primitive makes that whole class of bug structurally impossible — enforced by
 * the co-located `no-adhoc-viewport-overlay` lint rule.
 *
 * The portal is a POSITIONING mechanism, not a mount-retention one, and there is
 * deliberately no prop to turn it off. React reconciles a portal by container
 * identity, so putting one behind a condition — `cond ? createPortal(…) : …`, or
 * a container that changes — deletes the subtree and builds a new one. This
 * overlay always portals, always into `document.body`, so its subtree survives
 * its own rerenders; a caller who needs a subtree to survive a LAYOUT change
 * needs something else entirely (see the co-located
 * `web/__tests__/portal-toggle-remounts.test.tsx` and the
 * `no-portal-toggle` rule).
 */
export function ViewportOverlay({
  layer = "popover",
  className,
  children,
  ...rest
}: ViewportOverlayProps) {
  const forwarded = usePortalForwardedAttrs();
  const rootRef = useRef<HTMLDivElement>(null);

  // The one failure this primitive's design cannot make impossible. Portaling to
  // `<body>` escapes every ancestor INSIDE the app — that is the whole point —
  // but it cannot escape `body` and `html` themselves. A global `filter` or
  // `transform` there (a blur-while-locked scrim, a devtools frame, a browser
  // extension that wraps the page) is still a containing block for this box, and
  // the overlay is then clipped with no error, exactly like the ad-hoc `fixed
  // inset-0` this primitive exists to replace.
  //
  // `from: "parent"` because this element IS the fixed box: a `position: fixed`
  // element is its own stacking context, so an inclusive walk would report the
  // overlay against itself every time. Dev only — outside dev there is nobody to
  // fix it while the page is open, and the walk is not free.
  useViewportEscape(rootRef, {
    enabled: !!import.meta.env.DEV,
    from: "parent",
    subject: `a <ViewportOverlay layer="${layer}">`,
    remedy:
      "Remove the property from <body> / <html>, or scope it to a subtree that does not contain the portal root.",
  });

  return createPortal(
    <div
      {...forwarded}
      className={cn(OVERLAY_ROOT, zLayerClass(layer), className)}
      {...rest}
      // After the passthrough, like the class recipe above it: the primitive's
      // own audit is not something a caller can spread away.
      ref={rootRef}
    >
      {children}
    </div>,
    document.body,
  );
}
