import {
  FloatingAction,
  FloatingActionFadeIn,
} from "@plugins/primitives/plugins/overlay/plugins/floating-action/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { ControlSizeProvider } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { Theme } from "@plugins/primitives/plugins/css/plugins/theme-boundary/web";
import { useConfig } from "@plugins/config_v2/web";
import type { ReactNode } from "react";
import { isChromelessDocument } from "@plugins/primitives/plugins/embed/web";
import { chromeThemeScope } from "@plugins/apps-core/plugins/chrome-theme/web";
import { ActionBar } from "@plugins/shell/plugins/action-bar/web";
import { HealthReportButton } from "@plugins/shell/plugins/health-report/web";
import { actionBarConfig } from "../../shared/config";
import { useActionBarPinned } from "../internal/use-action-bar-pinned";
import { useFloatingBarSafeArea } from "../internal/use-floating-bar-safe-area";

/**
 * The always-visible leading item: the health report's dot, at the bar's `sm`
 * density (the density `ActionBar.Item` gives every other button in the bar).
 */
function HealthItem() {
  return (
    <ControlSizeProvider size="sm">
      <HealthReportButton />
    </ControlSizeProvider>
  );
}

/**
 * The floating bar's band: fixed at the viewport's right edge, publishing the
 * room it occupies as the safe area (see {@link useFloatingBarSafeArea}). Its
 * only in-flow child is the `FloatingAction` hitbox, which is pinned to the
 * COLLAPSED footprint and never follows the open panel — so the band's box is
 * the reservation, whether the bar is open or not. (The trigger is not: the
 * panel grows leftward from the right corner with the trigger at its start, so
 * opening carries the trigger to the expanded row's left end.) Its own
 * component so the reservation exists exactly as long as the band is mounted.
 */
function FloatingBand({ children }: { children: ReactNode }) {
  const ref = useFloatingBarSafeArea();
  return (
    // The band: fixed at the right edge, spanning the header row that
    // reserves the bar's room (CSS anchor positioning, see
    // `floating-bar-band` in app.css), so `my-auto` centres the bar on that
    // header's line at any header height. No header → it hangs at 0.5rem.
    <div
      ref={ref}
      // eslint-disable-next-line layout/no-adhoc-layout -- viewport-edge fixed band anchored to the surface-edge header (outside any transformed ancestor)
      className="floating-bar-band fixed right-3 z-popover flex flex-col"
    >
      {children}
    </div>
  );
}

/**
 * Floating overlay host (mounted at `Core.Root`, outside any transformed
 * ancestor). Renders only when **unpinned** — i.e. in fullscreen (solo) mode: a top-right `z-popover` overlay
 * collapsed to the health dot that hover-expands the action row leftward;
 * clicking the dot opens the health report.
 * Mounting in the root stacking context, one band above the solo placement's
 * `z-overlay` container, keeps it visible in every placement mode, including
 * solo (the headline fix).
 */
export function FloatingActionBarHost() {
  const { enabled } = useConfig(actionBarConfig);
  const pinned = useActionBarPinned();

  // A chromeless embed (`?embed=1`, see `primitives/embed`) has no chrome at
  // all, so the floating overlay stays out too. (The docked host needs no
  // branch: it lives in the tab bar, which a chromeless embed does not
  // render.) An embed that keeps its chrome (`?embed=chrome`) draws it.
  if (!enabled || pinned || isChromelessDocument()) return null;

  return (
    // The bar is chrome wherever it is mounted: floating over the app it still
    // wears the chrome's fixed theme, exactly as the docked strip does inside
    // the tab bar. `none` because the floating panel paints its own card.
    <Theme name={chromeThemeScope} surface="none">
      <FloatingBand>
        <FloatingAction
          // `relative` so the morphing panel anchors to this hitbox; `shrink-0`
          // so the zero-height fallback band cannot squash it (its only child
          // is absolute, so its min-content height is 0).
          // eslint-disable-next-line layout/no-adhoc-layout -- positioning box of the floating hitbox inside its anchored band (centring + no-squash mechanics, not a layout role)
          className="relative my-auto shrink-0"
          anchor="top-right"
          variant="ghost"
          // The health dot and the action row are different heights; centering
          // them keeps the dot on the row's centre line as the panel widens.
          align="center"
          trigger={<HealthItem />}
        >
          {/* eslint-disable-next-line layout/no-adhoc-layout -- animated max-width hover-reveal strip (clipped while collapsed) */}
          <FloatingActionFadeIn className="flex max-w-0 items-center gap-sm overflow-hidden whitespace-nowrap pr-sm transition-[max-width] duration-200 group-data-open/fa:max-w-[80rem]">
            <ActionBar.Item.Render />
          </FloatingActionFadeIn>
        </FloatingAction>
      </FloatingBand>
    </Theme>
  );
}

/**
 * Docked strip host (mounted at `Apps.TabBarActions`, the tab bar's trailing
 * zone). Renders only when **pinned** — i.e. in desktop and tab modes: a
 * right-aligned, non-compressing strip the tab strip scrolls under.
 */
export function DockedActionBarHost() {
  const { enabled } = useConfig(actionBarConfig);
  const pinned = useActionBarPinned();

  if (!enabled || !pinned) return null;

  return (
    // eslint-disable-next-line layout/no-adhoc-layout -- rigid leaf of the tab bar's flex (must not compress as tabs scroll under it)
    <Stack direction="row" gap="2xs" align="center" className="shrink-0 pl-sm">
      <HealthItem />
      <ActionBar.Item.Render />
    </Stack>
  );
}
