import { useEffect } from "react";
import { MdFullscreen, MdFullscreenExit } from "react-icons/md";
import { IconButton } from "@plugins/primitives/plugins/icon-button/web";
import { Pin } from "@plugins/primitives/plugins/css/plugins/pin/web";
import { exitBrowserFullscreen } from "@plugins/primitives/plugins/browser-fullscreen/web";
import type {
  PlacementChromeProps,
  PlacementDef,
} from "@plugins/apps/plugins/surface/web";

/**
 * The solo placement: a single tab full-app over everything. It portals its
 * container to `document.body` so the `fixed inset-0` box is relative to the
 * VIEWPORT (not the surface backdrop). `z-overlay` (NOT `z-max`): the box portals
 * to <body>, so a higher band than the floating layers (`z-popover`) would paint
 * its opaque `bg-background` over every popover/dropdown/dialog opened from inside
 * the solo'd app. `z-overlay` still covers all app chrome (`z-nav`) and the
 * surface backdrop, while letting floating layers surface above it.
 */
export const soloDef: PlacementDef = {
  id: "solo",
  label: "Fullscreen (solo)",
  icon: MdFullscreen,
  order: 2,
  portalToBody: true,
  // A single app fills the viewport, so the chrome wears the app's theme (like
  // docked, unlike floating's multi-window backdrop) — see useChromeThemeScope.
  themeScope: "app",
  containerClassName: "fixed inset-0 z-overlay bg-background",
  Chrome: SoloExitOverlay,
};

/**
 * Solo exit affordance: a hover-reveal "Exit fullscreen" button (Esc also exits,
 * via the shortcut contributed alongside this placement). Static class only — no
 * style push needed. Gated on `focused` so only the visible solo tab shows it.
 */
function SoloExitOverlay({ focused, onExitToDefault }: PlacementChromeProps) {
  // Leaving solo always leaves native browser fullscreen too — a single cleanup
  // that fires however solo is exited (Esc, this button, the placement picker, or
  // closing the tab), since this Chrome unmounts with the solo placement. Guarded
  // (no-op when not fullscreen), so a solo tab entered via the placement picker
  // without fullscreen is unaffected; only the floating "Fullscreen" button's
  // solo + fullscreen pair gets unwound symmetrically.
  useEffect(() => () => void exitBrowserFullscreen(), []);

  if (!focused) return null;
  return (
    <Pin
      to="top-right"
      // Asymmetric corner offsets (top-2 / right-3) overriding Pin's single-offset anchor.
      style={{ top: "0.5rem", right: "0.75rem" }}
      className="group/solo z-max"
    >
      <div className="opacity-0 transition-opacity pointer-events-none group-hover/solo:opacity-100 group-hover/solo:pointer-events-auto focus-within:opacity-100 focus-within:pointer-events-auto">
        <IconButton
          icon={MdFullscreenExit}
          label="Exit fullscreen (Esc)"
          variant="secondary"
          onClick={onExitToDefault}
        />
      </div>
    </Pin>
  );
}
