import { useEffect, useMemo } from "react";
import type { Contribution } from "@plugins/framework/plugins/web-sdk/core";
import { renderIsolated } from "@plugins/primitives/plugins/slot-render/web";
import { TooltipProvider } from "@plugins/primitives/plugins/ui-kit/web";
import {
  setBasePath,
  useSyncPaneRegistry,
} from "@plugins/primitives/plugins/pane/web";
import type { RailFramingProps } from "../../core";
import { Apps } from "../slots";
import { useActiveApp, usePathname } from "../internal/use-active-app";
import { TabsProvider, useTabs } from "../internal/use-tabs";
import { TabSurface } from "./tab-surface";
import { AppRail } from "./app-rail";
import { AppTabBar } from "./app-tab-bar";

/** Replace the URL and notify the router/pathname subscribers. */
function redirectTo(url: string) {
  window.history.replaceState({}, "", url);
  window.dispatchEvent(new PopStateEvent("popstate"));
  window.dispatchEvent(new CustomEvent("shell:navigate"));
}

/**
 * Inline fallback when no app-rail-framing plugin is loaded — the default
 * 2.5rem icon rail. Mirrors DefaultFlushFraming in app-shell. The rail variant
 * owns the flex wrapper and the `--app-rail-width` var (the rail's own width);
 * the rail is a flex sibling of `body`, so the sidebar bounded to `body` needs
 * no rail-width offset of its own.
 */
function DefaultRailFraming({ body }: RailFramingProps) {
  return (
    <div
      className="flex h-full min-h-0"
      style={{ "--app-rail-width": "2.5rem" } as React.CSSProperties}
    >
      <AppRail />
      {body}
    </div>
  );
}

/**
 * The keep-alive tab surface: every open tab mounted at once, only the focused
 * one visible (`display:none` keeps the rest mounted with their route + React
 * state). Each tab gets its own `PaneSurfaceProvider` binding its store + base
 * path, so background tabs hold their route in memory while the focused tab
 * mirrors to the URL. This is the `body` the rail-framing wraps — it sits to the
 * right of the rail, both below the top-level tab bar.
 */
export function AppTabsBody() {
  const { tabs, focusedTabId } = useTabs();
  return (
    // `transform-gpu` makes this a containing block for `position: fixed`
    // descendants, so an app shell's viewport-pinned sidebar (shadcn
    // `fixed inset-y-0`) bounds to the content area BELOW the tab bar instead of
    // overlapping it. Portalled overlays (floating bar, popovers, dialogs)
    // render at document.body and are unaffected.
    <div className="relative min-h-0 min-w-0 flex-1 transform-gpu">
      {tabs.map((tab) => {
        const focused = tab.tabId === focusedTabId;
        return (
          <div
            key={tab.tabId}
            className="absolute inset-0"
            style={{ display: focused ? "block" : "none" }}
          >
            <TabSurface tab={tab} />
          </div>
        );
      })}
    </div>
  );
}

/**
 * Mirrors the focused tab's content title into the browser document title
 * (`<Entity> — <App> — Singularity`), reusing the same per-tab titles the tab
 * bar shows. One global sync, so the browser tab name is never the stale static
 * "Singularity".
 */
function DocumentTitleSync() {
  const { tabs, focusedTabId, titles } = useTabs();
  const apps = Apps.App.useContributions();
  const focused = tabs.find((t) => t.tabId === focusedTabId);
  const appName = apps.find((a) => a.id === focused?.appId)?.tooltip;
  const entity = focused ? titles[focused.tabId] : undefined;
  useEffect(() => {
    document.title = [entity, appName, "Singularity"]
      .filter(Boolean)
      .join(" — ");
  }, [entity, appName]);
  return null;
}

export function AppsLayout() {
  const activeApp = useActiveApp();
  const allApps = Apps.App.useContributions();
  const pathname = usePathname();

  const matchedId = activeApp?.id;
  const fallbackPath = allApps.find((a) => a.fallback)?.path;

  // `/` is no longer an app — it redirects to the Home launcher. Any other
  // root-relative path that matches no app (e.g. a server-generated `/c/:id`
  // notification link) is canonicalized into the fallback app's namespace, so
  // the namespace stays hardcoded only at the app registration. These run
  // before the tabs surface mounts, normalizing the URL the seed tab reads.
  useEffect(() => {
    if (pathname === "/") {
      redirectTo("/home");
      return;
    }
    if (!matchedId && fallbackPath) {
      redirectTo(fallbackPath + pathname);
    }
  }, [pathname, matchedId, fallbackPath]);

  const basePath = activeApp?.path === "/" ? "" : (activeApp?.path ?? "");

  // Populate the global pane registry here, at the apps root, rather than
  // relying on the active app's layout renderer to do it. The registry reflects
  // *all* registered panes app-wide — a global invariant, not a per-renderer
  // concern. Syncing it here means a global action that opens a pane (e.g. the
  // theme customizer) can never throw "Unknown pane", even in an app whose
  // surface mounts no pane renderer. Renderers still re-sync (idempotent) and
  // own how an opened pane actually paints. This drives the *live* store (the
  // focused tab's), which `setBasePath`/`useSyncPaneRegistry` target.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- synchronous write before useSyncPaneRegistry, mirrors the renderer preamble
  useMemo(() => {
    setBasePath(basePath);
  }, [basePath]);
  useSyncPaneRegistry();

  // TooltipProvider stays outermost — AppRail uses WithTooltip and must sit
  // inside it; harmless over the rail-less `hidden` variant. TabsProvider wraps
  // the tab bar + framing so the rail's open-or-focus and the tab bar both read
  // the same tab state. The tab bar owns the full width at the top; the
  // rail-framing (rail + tab body) fills the area beneath it — so the rail sits
  // *below* the tab bar, not above it.
  return (
    <TooltipProvider delay={300}>
      <TabsProvider>
        <DocumentTitleSync />
        <div className="flex h-full min-h-0 flex-col">
          <AppTabBar />
          <div className="min-h-0 min-w-0 flex-1">
            <FramedSurface />
          </div>
        </div>
      </TabsProvider>
    </TooltipProvider>
  );
}

/** Renders the active surface arrangement inside the active rail-framing variant. */
function FramedSurface() {
  const framing = Apps.RailFraming.useContributions()[0];
  const arrangement = Apps.SurfaceArrangement.useContributions()[0];
  const body = arrangement ? (
    renderIsolated(
      Apps.SurfaceArrangement.id,
      arrangement as unknown as Contribution,
      {},
    )
  ) : (
    <AppTabsBody />
  );
  const props: RailFramingProps = { body };
  return framing ? (
    renderIsolated(
      Apps.RailFraming.id,
      framing as unknown as Contribution,
      props,
    )
  ) : (
    <DefaultRailFraming {...props} />
  );
}
