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
import { Tab, useActiveTabVariant } from "@plugins/ui/plugins/tab-bar/web";
import { Apps } from "@plugins/apps-core/web";
import { appIconComponent } from "@plugins/apps-core/plugins/app-icon/web";
import { useChromeThemeScope } from "@plugins/apps-core/plugins/theme-scope/web";
import {
  useTabs,
  placementIsNewTabFollows,
} from "@plugins/apps-core/plugins/tabs/web";

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
    mode,
    titles,
  } = useTabs();
  const apps = Apps.App.useContributions();
  // Docked/solo → wear the focused app's theme so the tab bar reads as one
  // surface with it; floating/no-app → inherit the desktop `:root` theme (no
  // attribute). See useChromeThemeScope.
  const themeScope = useChromeThemeScope();

  // The active variant decides the strip's vertical geometry. A "folder" variant
  // (connected) fills tabs to full height and removes the strip's centering moat
  // (bottom padding + border-b) so the active tab's bottom edge is the content
  // seam; chip/underline keep centered, padded, bottom-bordered tabs.
  const fillHeight = !!useActiveTabVariant()?.fillHeight;

  // The surface mode determines how `+` reads: in windows mode it opens a "new
  // window", otherwise a "new tab". Either way `openTab` adds a tab under the
  // current mode — the surface owns the mode, not the tab. (The tab bar is
  // covered while the surface is solo, so `+` is unreachable in that state.)
  const newTabIsWindow = placementIsNewTabFollows(mode);

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
      // The tab strip is chrome frame (like the sidebar/rail), so it wears the
      // recessed `--sidebar` surface — distinct from `--background`. That
      // figure/ground gap is what lets the active "connected" tab (which is
      // `bg-background`, matching the content surface directly below it) read as
      // raised out of the strip and fused with the content. A same-as-content
      // strip (e.g. bg-background) would erase the contrast; bg-muted is unsafe
      // because some presets make `--muted` lighter than `--background`.
      // When fillHeight, the strip drops its bottom padding AND its border-b so
      // the full-height active tab's bottom edge IS the content seam (no moat,
      // no line) — the recessed color step alone separates strip from content.
      // eslint-disable-next-line layout/no-adhoc-layout -- shrink-0 keeps the rigid tab bar's chrome height above the flexible tab body
      className={cn(
        "shrink-0 bg-sidebar px-xs",
        fillHeight ? "pt-2xs" : "border-b py-2xs",
      )}
    >
      <Scroll
        axis="x"
        hideScrollbar
        ref={containerRef}
        // self-stretch (when fillHeight): the tab scroller fills the strip's full
        // height so its tabs can stretch to the bottom seam; the trailing actions
        // stay vertically centered (the strip itself is items-center).
        // eslint-disable-next-line layout/no-adhoc-layout -- flexible strip yields width to the trailing actions; min-w-0 lets the tabs scroll instead of pushing them off-edge; self-stretch fills strip height for full-height folder tabs
        className={cn("min-w-0", fillHeight && "self-stretch")}
      >
      <Stack
        direction="row"
        align={fillHeight ? "stretch" : "center"}
        gap="2xs"
        className={fillHeight ? "h-full" : undefined}
      >
        <SortableList
          items={resolved.map(({ tab }) => tab.tabId)}
          onMove={(activeId, overId) => moveTab(activeId, overId)}
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
                    icon={appIconComponent(app.icon)}
                    // Ambient per-app attention indicator (e.g. Mail sync-error,
                    // Settings config-conflict) — the same badge the app-rail
                    // icon paints, now on the more-proximate tab chip. Rides the
                    // icon so it survives collapsed/icon-only mode.
                    badge={app.badge}
                    label={label}
                    active={active}
                    fillHeight={fillHeight}
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
          label={newTabIsWindow ? "New window" : "New tab"}
          onClick={() => openTab("home")}
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
            icon={appIconComponent(app.icon)}
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
  /** Optional per-app attention overlay, pinned to the tab icon (see TabIcon). */
  badge?: ComponentType<{ className?: string }>;
  label: string;
  active: boolean;
  collapsed: boolean;
  /** Full-height strip (folder variant) — the wrapper fills the row so the
   *  variant's own `h-full` can reach the bottom seam. */
  fillHeight?: boolean;
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
function TabChip({ appId, fillHeight, ...props }: TabChipProps) {
  const ref = useRef<HTMLDivElement>(null);
  const { active } = props;
  useEffect(() => {
    if (active) {
      ref.current?.scrollIntoView({ inline: "nearest", block: "nearest" });
    }
  }, [active]);
  return (
    <WithTooltip content={props.label}>
      {/* h-full lets the inner variant fill the full-height strip down to the
          content seam; fillHeight is a strip-geometry concern, so it stays here
          and is never forwarded onto the variant (would leak to the DOM). */}
      <Line
        as="div"
        ref={ref}
        data-app-tab={appId}
        className={fillHeight ? "h-full" : undefined}
      >
        <Tab {...props} />
      </Line>
    </WithTooltip>
  );
}
