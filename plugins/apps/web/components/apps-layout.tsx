import { useContext, useEffect, useMemo } from "react";
import type { Contribution } from "@plugins/framework/plugins/web-sdk/core";
import { renderIsolated } from "@plugins/primitives/plugins/slot-render/web";
import { TooltipProvider } from "@plugins/primitives/plugins/ui-kit/web";
import {
  PaneSurfaceProvider,
  PaneBasePathContext,
  setBasePath,
  useSyncPaneRegistry,
  useRoute,
  useIndexMatch,
  usePaneTitle,
} from "@plugins/primitives/plugins/pane/web";
import type { RailFramingProps } from "../../core";
import { Apps } from "../slots";
import { useActiveApp, usePathname } from "../internal/use-active-app";
import { appPathFor } from "../internal/tabs-store";
import { TabsProvider, useTabs } from "../internal/use-tabs";
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
function AppTabsBody() {
  const { tabs, focusedTabId } = useTabs();
  const apps = Apps.App.useContributions();
  return (
    // `transform-gpu` makes this a containing block for `position: fixed`
    // descendants, so an app shell's viewport-pinned sidebar (shadcn
    // `fixed inset-y-0`) bounds to the content area BELOW the tab bar instead of
    // overlapping it. Portalled overlays (floating bar, popovers, dialogs)
    // render at document.body and are unaffected.
    <div className="relative min-h-0 min-w-0 flex-1 transform-gpu">
      {tabs.map((tab) => {
        const app = apps.find((a) => a.id === tab.appId);
        if (!app) return null;
        const focused = tab.tabId === focusedTabId;
        return (
          <div
            key={tab.tabId}
            className="absolute inset-0"
            style={{ display: focused ? "block" : "none" }}
          >
            <PaneSurfaceProvider
              store={tab.store}
              basePath={appPathFor(tab.appId, apps)}
            >
              <TabTitleReporter tabId={tab.tabId} />
              {renderIsolated(Apps.App.id, app as unknown as Contribution)}
            </PaneSurfaceProvider>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Reads the tab's active leaf pane and publishes its resolved title up to the
 * tabs store, so the tab bar and the browser title can show the selected
 * page/conversation/song. Mounted inside each tab's `PaneSurfaceProvider`, so
 * `useRoute()` reads THIS tab's store — including background (keep-alive) tabs,
 * which keep their label fresh while unfocused. The actual `useTitle` hook runs
 * one level down in {@link LeafTitleReporter}, keyed by pane id.
 */
function TabTitleReporter({ tabId }: { tabId: string }) {
  const route = useRoute();
  const panes = route?.panes ?? [];
  const leaf = panes.length > 0 ? panes[panes.length - 1]! : null;
  return leaf ? (
    <LeafTitleReporter
      key={leaf.pane.id}
      tabId={tabId}
      pane={leaf.pane}
      params={leaf.fullParams}
      input={leaf.input}
    />
  ) : (
    <IndexTitleReporter key="index" tabId={tabId} />
  );
}

/**
 * Empty-route fallback: resolves the tab app's index pane (the `appPath`-scoped
 * pane with an empty segment) via {@link useIndexMatch} and publishes its title
 * through the same {@link LeafTitleReporter}/`usePaneTitle` path. This is what
 * lets two same-app index tabs show their index pane's title instead of the bare
 * app name. The base path is read from `PaneBasePathContext`, which this tab's
 * `PaneSurfaceProvider` already provides. Index panes without a title (e.g.
 * `chrome: false`) clear it, so the tab bar still falls back to the app name.
 */
function IndexTitleReporter({ tabId }: { tabId: string }) {
  const basePath = useContext(PaneBasePathContext);
  const entry = useIndexMatch(basePath)?.panes[0] ?? null;
  return entry ? (
    <LeafTitleReporter
      key={entry.pane.id}
      tabId={tabId}
      pane={entry.pane}
      params={entry.fullParams}
      input={entry.input}
    />
  ) : (
    <TitleClear tabId={tabId} />
  );
}

/**
 * Resolves and publishes one pane's title. Separate from {@link TabTitleReporter}
 * and keyed by pane id there, so the pane-specific `useTitle` hook (via
 * `usePaneTitle`) mounts/unmounts as a unit when the leaf pane changes — keeping
 * hook order stable across pane switches.
 */
function LeafTitleReporter({
  tabId,
  pane,
  params,
  input,
}: {
  tabId: string;
  pane: Parameters<typeof usePaneTitle>[0];
  params: Record<string, string>;
  input: Record<string, string>;
}) {
  const { setTabTitle } = useTabs();
  const title = usePaneTitle(pane, params, input);
  useEffect(() => {
    setTabTitle(tabId, title);
  }, [tabId, title, setTabTitle]);
  return null;
}

/** Clears a tab's title when its route is empty (app index / no leaf pane). */
function TitleClear({ tabId }: { tabId: string }) {
  const { setTabTitle } = useTabs();
  useEffect(() => {
    setTabTitle(tabId, undefined);
  }, [tabId, setTabTitle]);
  return null;
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

/** Renders the tabbed body inside the active rail-framing variant. */
function FramedSurface() {
  const framing = Apps.RailFraming.useContributions()[0];
  const body = <AppTabsBody />;
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
