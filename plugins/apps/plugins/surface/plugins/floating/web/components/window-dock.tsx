import { useMemo } from "react";
import { Apps, useTabs, type Tab } from "@plugins/apps/web";
import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { Cluster } from "@plugins/primitives/plugins/css/plugins/cluster/web";
import { ToggleChip } from "@plugins/primitives/plugins/css/plugins/toggle-chip/web";
import { WithTooltip } from "@plugins/primitives/plugins/tooltip/web";
import {
  bringWindowToFront,
  restoreWindow,
  useDesktops,
  useFloatingWindows,
  windowForTab,
  type FloatingWindow,
} from "../hooks/use-floating-windows";
import { WorkspacePager } from "./workspace-pager";

/**
 * The desktop dock (taskbar) for floating windows — the floating placement's
 * {@link PlacementDef.Foreground}, rendered once above all windows whenever the
 * floating Foreground is mounted. A macOS-style centered, translucent bar: one
 * chip per **window on the active virtual desktop** (active member's app icon +
 * title, suffixed ` (N)` when the window groups several tabs). The focused (and
 * visible) window reads as active; minimized windows dim, since they have fully
 * left the desktop. It is the restore target once a window is minimized.
 *
 * Its LEFT segment hosts the {@link WorkspacePager} — the per-desktop pager —
 * separated from the window chips by a thin divider, so the whole thing reads as
 * one cohesive bottom shelf (KDE / ChromeOS pattern) rather than two competing
 * centered bars. The pager organizes windows; like the dock it is still
 * windows/organization-only, never an app launcher (see this plugin's CLAUDE.md
 * passive-backdrop invariant). The bar therefore always renders while the
 * Foreground is mounted — even when the active desktop has zero windows, the user
 * must still see and switch desktops.
 *
 * Click follows the taskbar convention: the already-focused, non-minimized
 * window minimizes (toggles back to the dock); any other (or a minimized) window
 * un-minimizes, raises to front, and focuses its active member. Each chip is a
 * {@link ToggleChip} (the canonical stateful pill — icon + truncating label +
 * active state) so the dock writes no raw layout mechanics; the chips wrap via
 * {@link Cluster}.
 */
export function WindowDock({ tabIds }: { tabIds: string[] }) {
  const { tabs, titles, focusedTabId, focusTab } = useTabs();
  const map = useFloatingWindows();
  const { activeDesktopId } = useDesktops();
  const apps = Apps.App.useContributions();

  // tabId → Tab, so each chip can resolve its app (icon / tooltip) from appId.
  const byTabId = useMemo(() => {
    const m = new Map<string, Tab>();
    for (const t of tabs) m.set(t.tabId, t);
    return m;
  }, [tabs]);

  // Windows in the open-tab order: walk the open floating tabIds, mapping each to
  // its window and deduping (so a grouped window appears once, at its first
  // member's position). Filtered to the ACTIVE desktop — off-desktop windows are
  // hidden (display:none) and must not appear as taskbar chips. Keeps the dock
  // ordering stable and aligned with the apps tab order, exactly like cycle order.
  const windows = useMemo(() => {
    const seen = new Set<string>();
    const out: FloatingWindow[] = [];
    for (const tabId of tabIds) {
      const wid = windowForTab(tabId);
      if (!wid || seen.has(wid)) continue;
      const win = map.get(wid);
      if (!win || win.desktopId !== activeDesktopId) continue;
      seen.add(wid);
      out.push(win);
    }
    return out;
  }, [tabIds, map, activeDesktopId]);

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
        {/* Per-desktop workspace pager on the LEFT, then a thin divider, then the
            active desktop's window chips — one cohesive bottom shelf. The divider
            is dropped when there are no chips (empty active desktop = pager only). */}
        <WorkspacePager />
        {windows.length > 0 && (
          // A 1px hairline separating the pager from the chips. No layout
          // primitive models an in-row divider; the smallest acceptable construct.
          // eslint-disable-next-line layout/no-adhoc-layout -- genuine one-off: in-row hairline divider between the pager and the window chips; no primitive models it
          <div aria-hidden className="w-px self-stretch bg-border" />
        )}
        {windows.map((win) => {
          const tab = byTabId.get(win.activeTabId);
          const app = apps.find((a) => a.id === tab?.appId);
          const Icon = app?.icon;
          const base = titles[win.activeTabId] ?? app?.tooltip ?? "Window";
          const label =
            win.members.length > 1 ? `${base} (${win.members.length})` : base;
          const minimized = win.geo.minimized;
          const active = focusedTabId === win.activeTabId && !minimized;

          const onClick = () => {
            if (focusedTabId === win.activeTabId && !minimized) {
              restoreWindow(win.id, /* minimize */ true);
            } else {
              restoreWindow(win.id); // un-minimize if it was
              bringWindowToFront(win.id);
              focusTab(win.activeTabId);
            }
          };

          return (
            <WithTooltip key={win.id} content={label}>
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
