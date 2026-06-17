import { useMemo } from "react";
import { Apps, useTabs, type Tab } from "@plugins/apps/web";
import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { Cluster } from "@plugins/primitives/plugins/css/plugins/cluster/web";
import { ToggleChip } from "@plugins/primitives/plugins/css/plugins/toggle-chip/web";
import { WithTooltip } from "@plugins/primitives/plugins/tooltip/web";
import {
  bringWindowToFront,
  restoreWindow,
  useWindowGeometryMap,
} from "../hooks/use-window-geometry";

/**
 * The desktop dock (taskbar) for floating windows — the floating placement's
 * {@link PlacementDef.Foreground}, rendered once above all windows whenever >= 1
 * tab is floating. A macOS-style centered, translucent bar: one chip per open
 * window (app icon + truncated title). The focused (and visible) window reads as
 * active; minimized windows dim, since they have fully left the desktop. It is
 * the restore target once a window is minimized.
 *
 * Click follows the taskbar convention: the already-focused, non-minimized
 * window minimizes (toggles back to the dock); any other (or a minimized) window
 * un-minimizes, raises to front, and focuses. Each chip is a {@link ToggleChip}
 * (the canonical stateful pill — icon + truncating label + active state) so the
 * dock writes no raw layout mechanics; the chips wrap via {@link Cluster}.
 */
export function WindowDock({ tabIds }: { tabIds: string[] }) {
  const { tabs, titles, focusedTabId, focusTab } = useTabs();
  const map = useWindowGeometryMap();
  const apps = Apps.App.useContributions();

  // tabId → Tab, so each chip can resolve its app (icon / tooltip) from appId.
  const byTabId = useMemo(() => {
    const m = new Map<string, Tab>();
    for (const t of tabs) m.set(t.tabId, t);
    return m;
  }, [tabs]);

  if (tabIds.length === 0) return null;

  return (
    // The bottom-centered floating dock anchor over the desktop. This is the one
    // genuinely-positioned element — no layout primitive models a within-surface
    // (non-portaled) floating bar (viewport-overlay portals to <body>, escaping
    // the surface bounds), so the absolute anchor escapes the layout gate here.
    // eslint-disable-next-line layout/no-adhoc-layout -- genuine one-off: bottom-center desktop dock anchor; no positioning primitive models a within-surface floating bar
    <div className="pointer-events-none absolute bottom-3 left-1/2 z-overlay -translate-x-1/2">
      <Cluster
        gap="xs"
        className="pointer-events-auto rounded-lg border bg-muted/70 px-sm py-xs shadow-lg backdrop-blur"
      >
        {tabIds.map((tabId) => {
          const tab = byTabId.get(tabId);
          const app = apps.find((a) => a.id === tab?.appId);
          const Icon = app?.icon;
          const label = titles[tabId] ?? app?.tooltip ?? "Window";
          const minimized = map.get(tabId)?.minimized ?? false;
          const active = focusedTabId === tabId && !minimized;

          const onClick = () => {
            const g = map.get(tabId);
            if (focusedTabId === tabId && g && !g.minimized) {
              restoreWindow(tabId, /* minimize */ true);
            } else {
              restoreWindow(tabId); // un-minimize if it was
              bringWindowToFront(tabId);
              focusTab(tabId);
            }
          };

          return (
            <WithTooltip key={tabId} content={label}>
              <ToggleChip
                active={active}
                variant="ghost"
                icon={Icon ? <Icon /> : undefined}
                onClick={onClick}
                title={label}
                className={cn("max-w-40", minimized && "opacity-60")}
              >
                {label}
              </ToggleChip>
            </WithTooltip>
          );
        })}
      </Cluster>
    </div>
  );
}
