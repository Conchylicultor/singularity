import { MdFullscreen, MdFullscreenExit } from "react-icons/md";
import { IconButton } from "@plugins/primitives/plugins/icon-button/web";
import { Pin } from "@plugins/primitives/plugins/css/plugins/pin/web";
import type {
  PlacementChromeProps,
  PlacementDef,
} from "@plugins/apps-core/plugins/surface/web";

/**
 * The solo (fullscreen) surface mode: only the focused tab, full-viewport. It
 * portals its container to `document.body` so the `fixed inset-0` box is relative
 * to the VIEWPORT (not the surface backdrop). `z-overlay` (NOT `z-max`): the box
 * portals to <body>, so a higher band would paint its opaque `bg-background` over
 * every popover/dropdown/dialog opened from inside the solo'd app. `z-overlay`
 * still covers all app chrome (`z-nav`) and the surface backdrop.
 *
 * Mutual exclusion with windows mode is guaranteed one level up, structurally:
 * the surface is in exactly ONE mode, and each mode renders every tab under its
 * own descriptor. Solo does not set `visibleWhenUnfocused`, so only the focused
 * tab is painted and it declares no Backdrop/Foreground — so entering solo drops
 * the desktop wallpaper + window dock. There is simply no window to overlap it.
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
function SoloExitOverlay({ focused, onExit }: PlacementChromeProps) {
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
          onClick={onExit}
        />
      </div>
    </Pin>
  );
}
