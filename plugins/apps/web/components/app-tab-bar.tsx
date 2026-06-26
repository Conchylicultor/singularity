import {
  useEffect,
  useRef,
  type ComponentType,
} from "react";
import { MdAdd } from "react-icons/md";
import {
  cn,
  ControlSizeProvider,
  PortalThemeScopeProvider,
} from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { IconButton } from "@plugins/primitives/plugins/icon-button/web";
import { WithTooltip } from "@plugins/primitives/plugins/tooltip/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Line } from "@plugins/primitives/plugins/css/plugins/line/web";
import { Scroll } from "@plugins/primitives/plugins/css/plugins/scroll/web";
import { MeasureStrip } from "@plugins/primitives/plugins/css/plugins/measure-strip/web";
import { useResponsiveOverflow } from "@plugins/primitives/plugins/responsive-overflow/web";
import {
  SortableList,
  SortableItem,
} from "@plugins/primitives/plugins/sortable-list/web";
import { Tab } from "@plugins/ui/plugins/tab-bar/web";
import { Apps } from "../slots";
import { useChromeThemeScope } from "../internal/use-chrome-theme-scope";
import { useTabs } from "../internal/use-tabs";
import {
  getDefaultPlacement,
  placementIsNewTabFollows,
  tearOffPlacement,
} from "../internal/placement-registry";

/** Chip gap in px (`gap-2xs` ≈ 0.125rem) — fed to the overflow measurer. */
const CHIP_GAP_PX = 2;

/**
 * Horizontal tab bar above the app content (parallel to {@link AppRail}). One
 * tab per open tab — app icon + a label derived from the tab's active
 * pane/route (falling back to the app name) — with an active highlight on the
 * focused tab; clicking focuses it. Hovering a tab reveals a trailing `×`. The
 * tab itself is the themable {@link Tab} primitive, which renders the active
 * variant (chip / underline / connected); this bar no longer owns any chip
 * markup — it only arranges, measures, and wires behavior.
 *
 * Overflow: tabs collapse to icon-only one at a time, only as the bar runs out
 * of space — the tabs that fit keep their labels; the overflowing ones (from
 * the right) drop to icons (the focused tab always keeps its label). A hidden
 * measure strip (via {@link useResponsiveOverflow}) reports how many full tabs
 * fit; tabs past that count collapse — measured independently of the rendered
 * state, so there's no expand/collapse flip-flop. The `+` button is a
 * non-scrolling sibling of the strip so it's always reachable.
 */
export function AppTabBar() {
  const {
    tabs,
    focusedTabId,
    focusTab,
    closeTab,
    openTab,
    moveTab,
    setPlacement,
    titles,
  } = useTabs();
  const apps = Apps.App.useContributions();
  // Docked/solo → wear the focused app's theme so the tab bar reads as one
  // surface with it; floating/no-app → inherit the desktop `:root` theme (no
  // attribute). See useChromeThemeScope.
  const themeScope = useChromeThemeScope();

  // The focused tab's placement determines what `+` spawns: a placement that
  // "follows" the focused tab (e.g. another floating window in desktop mode)
  // opens a "new window"; otherwise `+` opens a "new tab" in the default
  // placement. The tab bar is covered while a tab is solo, so `+` is
  // unreachable in that state anyway.
  const focusedPlacement = tabs.find(
    (t) => t.tabId === focusedTabId,
  )?.placement;
  const newTabPlacement =
    focusedPlacement && placementIsNewTabFollows(focusedPlacement)
      ? focusedPlacement
      : getDefaultPlacement();

  const { containerRef, measureRef, visibleCount } = useResponsiveOverflow({
    count: tabs.length,
    gap: CHIP_GAP_PX,
  });

  const resolved = tabs.flatMap((tab) => {
    const app = apps.find((a) => a.id === tab.appId);
    if (!app) return [];
    // The tab's selected content (page / conversation / song …); the app name is
    // the fallback when the tab is at its index or its pane has no title.
    const label = titles[tab.tabId] ?? app.tooltip;
    return [{ tab, app, label }];
  });

  return (
    <PortalThemeScopeProvider scope={themeScope}>
    <Stack
      direction="row"
      align="center"
      gap="none"
      data-theme-scope={themeScope}
      // eslint-disable-next-line layout/no-adhoc-layout -- rigid tab bar above the flexible tab body in AppsLayout's column; shrink-0 keeps its chrome height
      className="shrink-0 border-b bg-background px-xs py-2xs"
    >
      <Scroll
        axis="x"
        hideScrollbar
        ref={containerRef}
        // eslint-disable-next-line layout/no-adhoc-layout -- flexible strip yields width to the trailing actions; min-w-0 lets the tabs scroll instead of pushing them off-edge
        className="min-w-0"
      >
      <Stack direction="row" align="center" gap="2xs">
        <SortableList
          items={resolved.map(({ tab }) => tab.tabId)}
          onMove={(activeId, overId) => moveTab(activeId, overId)}
          // Chrome-style tear-off: dragging a tab out of the strip floats the
          // tab as a window (then focuses it so it lands on top).
          onDragOut={(id) => {
            setPlacement(id, tearOffPlacement() ?? getDefaultPlacement());
            focusTab(id);
          }}
          orientation="horizontal"
          disabled={tabs.length < 2}
        >
          {resolved.map(({ tab, app, label }, i) => {
            const active = tab.tabId === focusedTabId;
            return (
              // Whole-chip drag: the sortable-list PointerSensor's 4px activation
              // distance lets a click still activate / close the tab.
              <SortableItem
                key={tab.tabId}
                id={tab.tabId}
                // eslint-disable-next-line layout/no-adhoc-layout -- flexible tab leaf of the tab strip; min-w-0 lets the tab shrink/truncate instead of overflowing
                className={(s) => cn("min-w-0", s.isDragging && "opacity-50")}
              >
                {() => (
                  <TabChip
                    appId={tab.appId}
                    icon={app.icon}
                    label={label}
                    active={active}
                    // Focused tab always keeps its label; other tabs go
                    // icon-only only once they overflow the bar (those past the
                    // count that fits at full width).
                    collapsed={i >= visibleCount && !active}
                    onActivate={() => focusTab(tab.tabId)}
                    onClose={() => closeTab(tab.tabId)}
                  />
                )}
              </SortableItem>
            );
          })}
        </SortableList>
      </Stack>
      </Scroll>
      <ControlSizeProvider size="sm">
        <IconButton
          icon={MdAdd}
          label={newTabPlacement !== getDefaultPlacement() ? "New window" : "New tab"}
          onClick={() => openTab("home", newTabPlacement)}
        />
      </ControlSizeProvider>
      {/* Push the trailing action zone to the far right edge so it sits at a
          fixed corner (like the former floating bar), independent of tab count. */}
      {/* eslint-disable-next-line layout/no-adhoc-layout -- pure growing spacer pinning the trailing actions to the right edge */}
      <div className="flex-1" />
      {/* Trailing action zone — the `surface` plugin drops its placement control
          here and the global action bar pins itself to the right edge. */}
      <Apps.TabBarActions.Render />
      {/* Hidden full-label measure strip: drives the collapse decision without
          affecting layout. Mirrors the responsive-overflow primitive's pattern.
          Renders the same {@link Tab} variant as the visible strip (full label,
          uncollapsed, with a no-op `onClose` so the measured tab includes the
          trailing `×` width) so the measured width matches the rendered one. */}
      <MeasureStrip ref={measureRef} gap={CHIP_GAP_PX} enabled={resolved.length > 0}>
        {resolved.map(({ tab, app, label }) => (
          <Tab
            key={tab.tabId}
            data-app-tab={tab.appId}
            icon={app.icon}
            label={label}
            active={false}
            collapsed={false}
            onClose={() => {}}
          />
        ))}
      </MeasureStrip>
    </Stack>
    </PortalThemeScopeProvider>
  );
}

interface TabChipProps {
  appId: string;
  icon: ComponentType<{ className?: string }>;
  label: string;
  active: boolean;
  collapsed: boolean;
  onActivate?: () => void;
  onClose?: () => void;
}

/**
 * One interactive tab; the focused tab scrolls itself into view. The themable
 * {@link Tab} primitive can't forward a root ref (it dispatches to a sealed
 * variant), so this wraps it in a tight {@link Line} box that owns the DOM
 * handle: `WithTooltip`'s trigger anchors to that box and `scrollIntoView`
 * targets it. The active/collapsed/icon/label/onActivate/onClose props pass
 * straight through to the variant.
 */
function TabChip({ appId, ...props }: TabChipProps) {
  const ref = useRef<HTMLDivElement>(null);
  const { active } = props;
  useEffect(() => {
    if (active) {
      ref.current?.scrollIntoView({ inline: "nearest", block: "nearest" });
    }
  }, [active]);
  return (
    <WithTooltip content={props.label}>
      <Line as="div" ref={ref} data-app-tab={appId}>
        <Tab {...props} />
      </Line>
    </WithTooltip>
  );
}
