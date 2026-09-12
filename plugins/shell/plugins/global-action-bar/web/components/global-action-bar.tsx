import { useEffect } from "react";
import {
  FloatingAction,
  FloatingActionFadeIn,
} from "@plugins/primitives/plugins/overlay/plugins/floating-action/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { ControlSizeProvider } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { useConfig } from "@plugins/config_v2/web";
import { useDraft } from "@plugins/primitives/plugins/persistent-draft/web";
import { isEmbeddedDocument } from "@plugins/primitives/plugins/embed/web";
import {
  getSurfaceMode,
  setSurfaceMode,
  useSurfaceMode,
} from "@plugins/apps-core/plugins/tabs/web";
import { ActionBar } from "@plugins/shell/plugins/action-bar/web";
import { HealthReportButton } from "@plugins/shell/plugins/health-report/web";
import { actionBarConfig } from "../../shared/config";
import { ViewOptionsButton } from "./view-options-button";

// Effectively permanent: the pin is a deliberate UI preference, not a transient
// draft, so it must outlive the persistent-draft primitive's default 7-day TTL.
const PIN_TTL = 10 * 365 * 24 * 60 * 60 * 1000;

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
 * The shared action set plus the gear popover (view options and the pin
 * toggle) — the expanding portion of the bar.
 */
function ActionRow({
  pinned,
  onTogglePin,
}: {
  pinned: boolean;
  onTogglePin: () => void;
}) {
  return (
    <>
      <ActionBar.Item.Render />
      <ControlSizeProvider size="sm">
        <ViewOptionsButton pinned={pinned} onTogglePin={onTogglePin} />
      </ControlSizeProvider>
    </>
  );
}

/**
 * Shared pin-toggle hook backing both hosts: the pin is the single persisted
 * preference (synced across the floating + docked mounts via persistent-draft).
 * Pinned is the default: the preference lives in per-origin localStorage, so
 * every fresh worktree origin (`<wt>.localhost:9000`) starts from it, and only
 * an explicit unpin is ever stored.
 * Turning the pin **on** while the focused tab is solo (fullscreen) snaps it
 * back to docked, since the pinned strip lives in the tab bar and must be
 * visible — "pinned ⇒ never solo".
 */
function useActionBarPin() {
  const [pinned, setPinned] = useDraft<boolean>("action-bar-pinned", true, {
    ttl: PIN_TTL,
  });
  const togglePin = () => {
    const next = !pinned;
    if (next && getSurfaceMode() === "solo") {
      setSurfaceMode("docked");
    }
    setPinned(next);
  };
  return { pinned, togglePin };
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
  const { pinned, togglePin } = useActionBarPin();

  // An embedded document (`?embed=1`, see `primitives/embed`) has no chrome
  // at all, so the floating overlay stays out too. (The docked host needs no
  // branch: it lives in the tab bar, which an embed does not render.)
  if (!enabled || pinned || isEmbeddedDocument()) return null;

  return (
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
        <ActionRow pinned={false} onTogglePin={togglePin} />
      </FloatingActionFadeIn>
    </FloatingAction>
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
  const { pinned, togglePin } = useActionBarPin();
  const mode = useSurfaceMode();

  useEffect(() => {
    if (pinned && mode === "solo") setSurfaceMode("docked");
  }, [pinned, mode]);

  if (!enabled || !pinned) return null;

  return (
    // eslint-disable-next-line layout/no-adhoc-layout -- rigid leaf of the tab bar's flex (must not compress as tabs scroll under it)
    <Stack direction="row" gap="sm" align="center" className="shrink-0 pl-sm">
      <HealthItem />
      <ActionRow pinned onTogglePin={togglePin} />
    </Stack>
  );
}
