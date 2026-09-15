import { useEffect } from "react";
import {
  FloatingAction,
  FloatingActionFadeIn,
} from "@plugins/primitives/plugins/overlay/plugins/floating-action/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { ControlSizeProvider } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { Theme } from "@plugins/primitives/plugins/css/plugins/theme-boundary/web";
import { useConfig } from "@plugins/config_v2/web";
import { isChromelessDocument } from "@plugins/primitives/plugins/embed/web";
import {
  setSurfaceMode,
  useSurfaceMode,
} from "@plugins/apps-core/plugins/tabs/web";
import { chromeThemeScope } from "@plugins/apps-core/plugins/chrome-theme/web";
import { ActionBar } from "@plugins/shell/plugins/action-bar/web";
import { HealthReportButton } from "@plugins/shell/plugins/health-report/web";
import { actionBarConfig } from "../../shared/config";
import { useActionBarPin } from "../internal/use-action-bar-pin";

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
 * Floating overlay host (mounted at `Core.Root`, outside any transformed
 * ancestor). Renders only when **unpinned**: a top-right `z-popover` overlay
 * collapsed to the health dot that hover-expands the action row leftward;
 * clicking the dot opens the health report.
 * Mounting in the root stacking context, one band above the solo placement's
 * `z-overlay` container, keeps it visible in every placement mode, including
 * solo (the headline fix).
 */
export function FloatingActionBarHost() {
  const { enabled } = useConfig(actionBarConfig);
  const { pinned } = useActionBarPin();

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
      <FloatingAction
        // eslint-disable-next-line layout/no-adhoc-layout -- viewport-corner fixed overlay anchored top-right (outside any transformed ancestor)
        className="fixed top-2 right-3 z-popover"
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
    </Theme>
  );
}

/**
 * Docked strip host (mounted at `Apps.TabBarActions`, the tab bar's trailing
 * zone). Renders only when **pinned**: a right-aligned, non-compressing strip
 * the tab strip scrolls under. A guard effect enforces "pinned ⇒ never solo" —
 * if the focused tab is moved to solo from the placement control while pinned,
 * it snaps back to docked so the strip stays visible.
 */
export function DockedActionBarHost() {
  const { enabled } = useConfig(actionBarConfig);
  const { pinned } = useActionBarPin();
  const mode = useSurfaceMode();

  useEffect(() => {
    if (pinned && mode === "solo") setSurfaceMode("docked");
  }, [pinned, mode]);

  if (!enabled || !pinned) return null;

  return (
    // eslint-disable-next-line layout/no-adhoc-layout -- rigid leaf of the tab bar's flex (must not compress as tabs scroll under it)
    <Stack direction="row" gap="2xs" align="center" className="shrink-0 pl-sm">
      <HealthItem />
      <ActionBar.Item.Render />
    </Stack>
  );
}
