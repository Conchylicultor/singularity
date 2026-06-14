import { useEffect, useMemo, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { MdFullscreenExit } from "react-icons/md";
import { TabSurface, useTabs, type Tab } from "@plugins/apps/web";
import { IconButton } from "@plugins/primitives/plugins/icon-button/web";
import {
  CHROME_THEME_SCOPE,
  PortalThemeScopeProvider,
} from "@plugins/primitives/plugins/ui-kit/web";
import { ScopedAppTheme } from "@plugins/ui/plugins/theme-engine/web";
import {
  pruneWindowGeometry,
  useWindowGeometry,
  type Geometry,
} from "../hooks/use-window-geometry";
import { WindowChrome, WINDOW_TITLEBAR_INSET } from "./window-chrome";

/**
 * The single surface body that renders EVERY open tab at once and positions each
 * by its own per-tab placement (docked / floating / solo). There is no global
 * arrangement mode — the surface looks like "tabs" when all docked, "desktop"
 * once any float, "full app" when the focused tab is solo. Contributed into
 * `Apps.Surface`; mounted inside `TabsProvider`, so it reads `useTabs()` directly.
 *
 * Each tab is ONE stable container keyed by `tabId` whose parent chain never
 * changes across placement transitions — only the wrapper CSS and the presence
 * of the sibling `WindowChrome` change — so tearing a tab off / docking / soloing
 * never remounts its `TabSurface` (Chrome-style keep-alive).
 */
export function SurfaceBody() {
  const { tabs, focusedTabId, focusTab, closeTab, setPlacement, titles } =
    useTabs();

  // Drop geometry for windows that are no longer open, keyed on the live tab id
  // set so a closed window's box doesn't linger in the per-tab store.
  const openIds = useMemo(() => tabs.map((t) => t.tabId).join(","), [tabs]);
  useEffect(() => {
    pruneWindowGeometry(new Set(tabs.map((t) => t.tabId)));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the id set, not the tab objects
  }, [openIds]);

  // One scoped theme `<style>` per DISTINCT app, so each tab's inline content
  // adopts its own app's palette (two tabs of the same app share one block, keyed
  // on app id). Each tab container is tagged `data-theme-scope="app:<id>"`; the
  // backdrop itself wears the chrome scope so chrome/portals keep the global theme.
  const appIds = useMemo(() => [...new Set(tabs.map((t) => t.appId))], [tabs]);

  return (
    // The shared backdrop for all placements. `transform-gpu` makes it the
    // containing block for the absolutely-positioned tabs (and their fixed-position
    // app chrome), so docked/floating tabs are clipped to the surface below the
    // tab bar. (Solo tabs escape via `position: fixed`.)
    <div
      data-theme-scope={CHROME_THEME_SCOPE}
      className="relative h-full w-full overflow-hidden bg-background transform-gpu"
    >
      {appIds.map((id) => (
        <ScopedAppTheme key={id} appId={id} />
      ))}
      {tabs.map((tab) => (
        <TabContainer
          key={tab.tabId}
          tab={tab}
          focused={tab.tabId === focusedTabId}
          title={titles[tab.tabId]}
          onFocus={() => focusTab(tab.tabId)}
          onClose={() => closeTab(tab.tabId)}
          onExitSolo={() => setPlacement(tab.tabId, "docked")}
        />
      ))}
    </div>
  );
}

interface TabContainerProps {
  tab: Tab;
  focused: boolean;
  title: string | undefined;
  onFocus: () => void;
  onClose: () => void;
  onExitSolo: () => void;
}

/**
 * One tab's stable keep-alive container. Always calls `useWindowGeometry` (cheap
 * read/seed) so the floating box is available without changing the hook order
 * across placement transitions. `TabSurface` is always a direct child wrapped in
 * an always-present content inset div whose CSS alone changes — never a remount.
 */
function TabContainer({
  tab,
  focused,
  title,
  onFocus,
  onClose,
  onExitSolo,
}: TabContainerProps) {
  const [geo, setGeo, bringToFront] = useWindowGeometry(tab.tabId);
  const placement = tab.placement;
  const floating = placement === "floating";
  const solo = placement === "solo";

  // Hidden tabs stay mounted (keep-alive): docked & solo show only when focused;
  // floating windows are always visible.
  const visible = floating || focused;

  const container = (
    <div
      // Focus + raise on any pointer-down inside a floating window, before inner
      // handlers run, so clicking a background window brings it forward first.
      onPointerDownCapture={
        floating
          ? () => {
              onFocus();
              bringToFront();
            }
          : undefined
      }
      // Tags this tab's subtree so the matching `ScopedAppTheme` block themes its
      // inline content with this app's palette. Portaled descendants escape this
      // attribute, so they re-adopt the theme via the PortalThemeScopeProvider
      // wrapping TabSurface below.
      data-theme-scope={`app:${tab.appId}`}
      className={containerClass(placement)}
      style={placementStyle(placement, geo, visible)}
    >
      {/* Stable content inset: ALWAYS present so `TabSurface`'s parent chain is
          identical in every placement. Only its CSS (top inset under the floating
          titlebar; hidden while a floating window is minimized) changes. The
          PortalThemeScopeProvider is ALSO always present (stable scope per tab),
          so adding/removing it never remounts TabSurface (keep-alive). */}
      <div
        className="absolute inset-0 min-h-0 min-w-0 transform-gpu"
        style={contentInsetStyle(floating, geo)}
      >
        <PortalThemeScopeProvider scope={`app:${tab.appId}`}>
          <TabSurface tab={tab} />
        </PortalThemeScopeProvider>
      </div>

      {/* Floating chrome as a SIBLING overlay (never a parent of TabSurface). */}
      {floating && (
        <WindowChrome
          appId={tab.appId}
          title={title}
          focused={focused}
          geo={geo}
          setGeo={setGeo}
          onClose={onClose}
        />
      )}

      {/* Solo exit affordance: a hover-reveal "Exit fullscreen" button (Esc also
          exits, via the surface plugin's shortcut). */}
      {solo && focused && (
        <div className="group/solo absolute top-2 right-3 z-max">
          <div className="opacity-0 transition-opacity group-hover/solo:opacity-100 focus-within:opacity-100">
            <IconButton
              icon={MdFullscreenExit}
              label="Exit fullscreen (Esc)"
              variant="secondary"
              onClick={onExitSolo}
            />
          </div>
        </div>
      )}
    </div>
  );

  // A solo tab portals its container to `document.body` so its `fixed inset-0`
  // box is relative to the VIEWPORT, not the `transform-gpu` backdrop (which would
  // otherwise contain it below the tab bar / right of the rail). `createPortal`
  // only moves the DOM node — the React tree position is unchanged, so
  // `TabSurface` keeps its state across the dock↔solo transition (keep-alive
  // preserved).
  return solo ? createPortal(container, document.body) : container;
}

/** Static class for the tab container per placement (geometry goes inline). */
function containerClass(placement: Tab["placement"]): string {
  if (placement === "floating") {
    return "absolute overflow-hidden rounded-lg border bg-background shadow-lg";
  }
  if (placement === "solo") {
    return "fixed inset-0 z-max bg-background";
  }
  // docked → full-area backdrop (visibility gated inline).
  return "absolute inset-0";
}

/**
 * The inline box style per placement:
 * - docked → full-area (class `inset-0`); shown only when focused.
 * - floating → the geometry box (maximized → fill the backdrop); always visible.
 * - solo → `fixed inset-0 z-max` (class); shown only when focused.
 */
function placementStyle(
  placement: Tab["placement"],
  geo: Geometry,
  visible: boolean,
): CSSProperties {
  if (placement === "floating") {
    const box: CSSProperties = geo.maximized
      ? { left: 0, top: 0, right: 0, bottom: 0, zIndex: geo.z }
      : { left: geo.x, top: geo.y, width: geo.w, height: geo.h, zIndex: geo.z };
    return box;
  }
  // docked + solo are full-area via class; just gate visibility (keep-alive).
  return { display: visible ? "block" : "none" };
}

/**
 * The content-inset wrapper CSS. While floating, push content below the titlebar
 * and hide it (kept mounted) when the window is minimized; otherwise full-bleed.
 */
function contentInsetStyle(floating: boolean, geo: Geometry): CSSProperties {
  if (!floating) return {};
  if (geo.minimized) return { display: "none" };
  return { top: WINDOW_TITLEBAR_INSET };
}
