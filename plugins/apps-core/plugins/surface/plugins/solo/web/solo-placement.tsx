import { MdFullscreen, MdFullscreenExit } from "react-icons/md";
import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { IconButton } from "@plugins/primitives/plugins/icon-button/web";
import { Pin } from "@plugins/primitives/plugins/css/plugins/pin/web";
import type {
  PlacementChromeProps,
  PlacementDef,
} from "@plugins/apps-core/plugins/surface/web";

/**
 * The solo (fullscreen) surface mode: only the focused tab, full-viewport. It
 * asks for the `viewport` frame, which is the whole statement: the host both
 * positions the container against the window and drops the `transform` off its
 * backdrop while this mode is active, so the box resolves against the viewport
 * instead of the content area (the exact mechanics, and why the frame's z-band
 * is `z-overlay` and not `z-max`, live on `FRAME_CLASS` in the host). The tab
 * itself does not move: the container stays exactly where it is in the tree,
 * which is what keeps the app inside it mounted (its scroll, its edits, its
 * iframes).
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
  frame: "viewport",
  // A single app fills the viewport, so the chrome wears the app's theme (like
  // docked, unlike floating's multi-window backdrop) — see useChromeThemeScope.
  themeScope: "app",
  paintClassName: cn("bg-background"),
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
