import { useEffect } from "react";
import type { Contribution } from "@plugins/framework/plugins/web-sdk/core";
import { renderIsolated } from "@plugins/primitives/plugins/slot-render/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { TooltipProvider } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import {
  setBasePath,
  useSyncPaneRegistry,
  useRenderSync,
} from "@plugins/primitives/plugins/pane/web";
import type { RailFramingProps } from "@plugins/apps-core/core";
import {
  Apps,
  useActiveApp,
  usePathname,
  defaultApp,
} from "@plugins/apps-core/web";
import { TabsProvider, useTabs } from "@plugins/apps-core/plugins/tabs/web";
import { AppTabsBody } from "@plugins/apps-core/plugins/tab-surface/web";
import { AppRail } from "@plugins/apps-core/plugins/app-rail/web";
import { AppTabBar } from "@plugins/apps-core/plugins/tab-bar/web";

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
    <Stack
      direction="row"
      gap="none"
      className="h-full min-h-0"
      style={{ "--app-rail-width": "2.5rem" } as React.CSSProperties}
    >
      <AppRail />
      {body}
    </Stack>
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
  const pathname = usePathname();
  const apps = Apps.App.useContributions();

  const matchedId = activeApp?.id;
  const defaultPath = defaultApp(apps)?.path;

  // Any path that matches no app — the bare root `/`, or a stale deep link whose
  // app was removed — redirects to the default app (the one declaring
  // `default: true`, else the only/first registered app). Every app owns its
  // `path` prefix and emits full-path deep links under it (e.g. `/agents/c/:id`),
  // so a resolvable URL always matches an app directly; there is no catch-all
  // app. Runs before the tabs surface mounts, normalizing the URL the seed tab
  // reads. No-ops when no apps are registered (nothing to redirect to).
  useEffect(() => {
    if (!matchedId && defaultPath) redirectTo(defaultPath);
  }, [pathname, matchedId, defaultPath]);

  const basePath = activeApp?.path ?? "";

  // Populate the global pane registry here, at the apps root, rather than
  // relying on the active app's layout renderer to do it. The registry reflects
  // *all* registered panes app-wide — a global invariant, not a per-renderer
  // concern. Syncing it here means a global action that opens a pane (e.g. the
  // theme customizer) can never throw "Unknown pane", even in an app whose
  // surface mounts no pane renderer. Renderers still re-sync (idempotent) and
  // own how an opened pane actually paints. This drives the *live* store (the
  // focused tab's), which `setBasePath`/`useSyncPaneRegistry` target.
  useRenderSync(() => {
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
        <Stack gap="none" className="h-full min-h-0">
          <AppTabBar />
          {/* eslint-disable-next-line layout/no-adhoc-layout -- flexible fill leaf below the rigid tab bar; bounds the framed surface's own scroll */}
          <div className="min-h-0 min-w-0 flex-1">
            <FramedSurface />
          </div>
        </Stack>
      </TabsProvider>
    </TooltipProvider>
  );
}

/** Renders the surface body inside the active rail-framing variant. */
function FramedSurface() {
  const framing = Apps.RailFraming.useContributions()[0];
  const surface = Apps.Surface.useContributions()[0];
  // The `surface` plugin owns the multi-placement body; with no contributor,
  // `apps` degrades to its built-in docked-only strip.
  const body = surface ? (
    renderIsolated(
      Apps.Surface.id,
      surface as unknown as Contribution,
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
