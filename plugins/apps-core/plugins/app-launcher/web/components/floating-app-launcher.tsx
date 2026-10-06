import { useEffect, useState } from "react";
import { useSurfaceMode, useTabs } from "@plugins/apps-core/plugins/tabs/web";
import { chromeThemeScope } from "@plugins/apps-core/plugins/chrome-theme/web";
import { useBrandDrawnOn } from "@plugins/primitives/plugins/app-shell/web";
import { isChromelessDocument } from "@plugins/primitives/plugins/embed/web";
import { Theme } from "@plugins/primitives/plugins/css/plugins/theme-boundary/web";
import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { AppLauncher } from "./app-launcher";

/** How close to the viewport's top-left corner (px) the pointer must come for
 * the launcher to show. */
const REVEAL_RADIUS = 96;

/**
 * Whether the pointer is within {@link REVEAL_RADIUS} of the viewport's
 * top-left corner. A window listener rather than a hover zone: an invisible
 * box over the corner would swallow clicks meant for the app beneath it.
 * Leaving the window keeps the last answer, so running the pointer off the top
 * of the page through the corner leaves the launcher shown.
 */
function usePointerNearTopLeft(): boolean {
  const [near, setNear] = useState(false);
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      setNear(Math.hypot(e.clientX, e.clientY) <= REVEAL_RADIUS);
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, []);
  return near;
}

/**
 * The launcher for a solo (fullscreen) surface that draws no brand of its own
 * — an app with no shell chrome, like the app gallery or the website. Solo
 * hides the app rail and tab bar, so without it such an app has no way to
 * another. Mounted at `Apps.Overlay` — inside the tab state, which switching
 * apps needs — and mirroring the floating action bar (top-left here,
 * top-right there, on the same anchored band), it stays
 * hidden until the pointer nears the corner, and stays shown while it holds
 * focus or its app grid is open.
 *
 * Whether the focused surface draws the brand is read from what is mounted
 * (`useBrandDrawnOn`), never declared per app, so an app that gains or loses
 * its shell chrome needs no change here.
 */
export function FloatingAppLauncher() {
  const solo = useSurfaceMode() === "solo";
  const { focusedTabId } = useTabs();
  const brandDrawn = useBrandDrawnOn(focusedTabId);
  if (!solo || brandDrawn || isChromelessDocument()) return null;
  return <RevealedLauncher />;
}

/** Its own component so the pointer listener exists only while it can show. */
function RevealedLauncher() {
  const near = usePointerNearTopLeft();
  return (
    // Chrome wherever it is mounted, as the floating action bar is.
    <Theme name={chromeThemeScope} surface="none">
      {/* The band the floating action bar hangs on (`floating-bar-band` in
          app.css: centred on the surface-edge header when there is one, else
          0.5rem down), mirrored to the left edge. */}
      <div
        // eslint-disable-next-line layout/no-adhoc-layout -- viewport-edge fixed band anchored to the surface-edge header (outside any transformed ancestor), mirroring the floating action bar's
        className="floating-bar-band fixed left-3 z-popover flex flex-col"
      >
        <div
          // Hidden is BOTH transparent and not a hit target. Shown while the
          // pointer is near, the button is focused, or its grid is open (the
          // trigger's `aria-expanded`), so moving into the grid keeps it.
          // eslint-disable-next-line layout/no-adhoc-layout -- centres the launcher on the anchored band (the floating action bar's `my-auto`), with its reveal transition
          className={cn(
            "my-auto shrink-0 rounded-md bg-background shadow-sm transition-opacity duration-150",
            !near &&
              "[&:not(:focus-within,:has([aria-expanded=true]))]:pointer-events-none [&:not(:focus-within,:has([aria-expanded=true]))]:opacity-0",
          )}
        >
          <AppLauncher form="icon" />
        </div>
      </div>
    </Theme>
  );
}
