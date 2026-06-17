import {
  forwardRef,
  useEffect,
  useRef,
  type ComponentType,
  type HTMLAttributes,
} from "react";
import { createPortal } from "react-dom";
import { MdAdd, MdClose } from "react-icons/md";
import {
  cn,
  PortalThemeScopeProvider,
} from "@plugins/primitives/plugins/ui-kit/web";
import { IconButton } from "@plugins/primitives/plugins/icon-button/web";
import { TruncatingText } from "@plugins/primitives/plugins/truncating-text/web";
import { WithTooltip } from "@plugins/primitives/plugins/tooltip/web";
import { useResponsiveOverflow } from "@plugins/primitives/plugins/responsive-overflow/web";
import {
  SortableList,
  SortableItem,
} from "@plugins/primitives/plugins/sortable-list/web";
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
 * chip per open tab — app icon + a label derived from the tab's active
 * pane/route (falling back to the app name) — with an active highlight on the
 * focused tab; clicking focuses it. Hovering a tab reveals a trailing `×`.
 *
 * Overflow: tabs collapse to icon-only one at a time, only as the bar runs out
 * of space — the chips that fit keep their labels; the overflowing ones (from
 * the right) drop to icons (the focused tab always keeps its label). A hidden
 * measure strip (via {@link useResponsiveOverflow}) reports how many full chips
 * fit; chips past that count collapse — measured independently of the rendered
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
    <div
      data-theme-scope={themeScope}
      className="flex shrink-0 items-center border-b bg-background px-xs py-2xs"
    >
      <div
        ref={containerRef}
        className="flex min-w-0 items-center gap-2xs overflow-x-auto [&::-webkit-scrollbar]:hidden"
      >
        <SortableList
          items={resolved.map(({ tab }) => tab.tabId)}
          onMove={(activeId, overId) => moveTab(activeId, overId)}
          // Chrome-style tear-off: dragging a chip out of the strip floats the
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
      </div>
      <IconButton
        icon={MdAdd}
        label={newTabPlacement !== getDefaultPlacement() ? "New window" : "New tab"}
        size="icon-sm"
        onClick={() => openTab("home", newTabPlacement)}
      />
      {/* Push the trailing action zone to the far right edge so it sits at a
          fixed corner (like the former floating bar), independent of tab count. */}
      <div className="flex-1" />
      {/* Trailing action zone — the `surface` plugin drops its placement control
          here and the global action bar pins itself to the right edge. */}
      <Apps.TabBarActions.Render />
      {/* Hidden full-label measure strip: drives the collapse decision without
          affecting layout. Mirrors the responsive-overflow primitive's pattern. */}
      {resolved.length > 0 &&
        createPortal(
          <div
            ref={measureRef}
            aria-hidden
            style={{
              position: "fixed",
              top: -9999,
              left: -9999,
              display: "flex",
              gap: CHIP_GAP_PX,
              opacity: 0,
              pointerEvents: "none",
            }}
          >
            {resolved.map(({ tab, app, label }) => (
              <ChipShell
                key={tab.tabId}
                appId={tab.appId}
                icon={app.icon}
                label={label}
                active={false}
                collapsed={false}
              />
            ))}
          </div>,
          document.body,
        )}
    </div>
    </PortalThemeScopeProvider>
  );
}

interface ChipProps {
  appId: string;
  icon: ComponentType<{ className?: string }>;
  label: string;
  active: boolean;
  collapsed: boolean;
  onActivate?: () => void;
  onClose?: () => void;
}

/**
 * Presentational chip markup shared by the interactive tab and the hidden
 * measure strip, so both have identical width. A `forwardRef` host element so
 * `WithTooltip`'s trigger can merge its ref/handlers (and {@link TabChip}'s
 * scroll-into-view ref) onto the root. `onActivate`/`onClose` are only wired by
 * the interactive {@link TabChip}; the measure strip renders it inert.
 */
const ChipShell = forwardRef<
  HTMLDivElement,
  ChipProps & HTMLAttributes<HTMLDivElement>
>(function ChipShell(
  { appId, icon: Icon, label, active, collapsed, onActivate, onClose, ...rest },
  ref,
) {
  return (
    <div
      ref={ref}
      data-app-tab={appId}
      className={cn(
        "group flex max-w-40 min-w-0 items-center gap-xs rounded-md py-2xs pl-xs pr-2xs text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
        active && "bg-sidebar-accent text-sidebar-accent-foreground",
      )}
      {...rest}
    >
      <button
        type="button"
        aria-pressed={active}
        onClick={onActivate}
        className="flex min-w-0 flex-1 items-center gap-xs"
      >
        <Icon className="size-4 shrink-0" />
        {!collapsed && (
          <TruncatingText className="text-label">{label}</TruncatingText>
        )}
      </button>
      {!collapsed && (
        <button
          type="button"
          aria-label={`Close ${label}`}
          onClick={onClose}
          className={cn(
            "flex size-4 shrink-0 items-center justify-center rounded-sm opacity-0 transition-[color,background-color,opacity] hover:bg-sidebar-foreground/10 hover:text-sidebar-accent-foreground group-hover:opacity-100 focus-visible:opacity-100",
            active && "opacity-70",
          )}
        >
          <MdClose className="size-3.5" />
        </button>
      )}
    </div>
  );
});

/** One interactive tab chip; the focused chip scrolls itself into view. */
function TabChip(props: ChipProps) {
  const ref = useRef<HTMLDivElement>(null);
  const { active } = props;
  useEffect(() => {
    if (active) {
      ref.current?.scrollIntoView({ inline: "nearest", block: "nearest" });
    }
  }, [active]);
  return (
    <WithTooltip content={props.label}>
      <ChipShell {...props} ref={ref} />
    </WithTooltip>
  );
}
