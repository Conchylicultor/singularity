import { MdFullscreen, MdFullscreenExit } from "react-icons/md";
import { IconButton } from "@plugins/primitives/plugins/icon-button/web";
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
  if (!focused) return null;
  return (
    <div className="group/solo absolute top-2 right-3 z-max">
      <div className="opacity-0 transition-opacity group-hover/solo:opacity-100 focus-within:opacity-100">
        <IconButton
          icon={MdFullscreenExit}
          label="Exit fullscreen (Esc)"
          variant="secondary"
          onClick={onExitToDefault}
        />
      </div>
    </div>
  );
}
