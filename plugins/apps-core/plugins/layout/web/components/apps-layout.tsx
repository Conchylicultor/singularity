import { useEffect } from "react";
import {
  useDeferredLoadState,
  useHasLoadErrorUnder,
  type Contribution,
} from "@plugins/framework/plugins/web-sdk/core";
import { renderIsolated } from "@plugins/primitives/plugins/slot-render/web";
import { Center } from "@plugins/primitives/plugins/css/plugins/center/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Button, TooltipProvider } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { Loading } from "@plugins/primitives/plugins/loading/web";
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
  matchAppForPath,
} from "@plugins/apps-core/web";
import { TabsProvider, useTabs } from "@plugins/apps-core/plugins/tabs/web";
import { AppTabsBody } from "@plugins/apps-core/plugins/tab-surface/web";
import { shouldRedirectToDefaultApp } from "../internal/redirect-gate";

/** Replace the URL and notify the router/pathname subscribers. */
function redirectTo(url: string) {
  window.history.replaceState({}, "", url);
  window.dispatchEvent(new PopStateEvent("popstate"));
  window.dispatchEvent(new CustomEvent("shell:navigate"));
}

/**
 * Import-free fallback when no `Apps.RailFraming` contributor is loaded: no
 * rail, `body` fills the full width. Rail chrome is opt-in via `Apps.RailFraming`
 * — a filtered composition that never selects a rail-framing variant gets this
 * railless surface. The `--app-rail-width: 0px` keeps the rail-width var
 * consistent for any downstream reader (mirrors `app-rail-framing/hidden`).
 */
function RaillessFraming({ body }: RailFramingProps) {
  return (
    <Stack
      direction="row"
      gap="none"
      className="h-full min-h-0"
      style={{ "--app-rail-width": "0px" } as React.CSSProperties}
    >
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
  const { deferredComplete } = useDeferredLoadState();
  // Coarse by design: when ANY app shell's subtree failed to load, the URL→app
  // mapping is unknowable (a failed shell never registered its path), so a load
  // error anywhere under the apps tier suppresses the destructive redirect. The
  // safe failure direction — preserve the URL, show the error surface.
  const anyAppShellLoadError = useHasLoadErrorUnder("apps/plugins/");

  // The canonicalization redirect must stay URL-driven: it rewrites the address
  // bar to a real app when the URL matches none, so its "matched" signal is
  // whether the URL resolves to an app — `matchAppForPath(pathname)`. NOT
  // `useActiveApp()`, which now derives from the FOCUSED TAB's app (the snapshot
  // model) and would report a match even on an unmatched URL, defeating the
  // redirect. Chrome identity (theme/rail) legitimately follows the focused tab
  // via `activeApp`; canonicalization legitimately follows the URL — kept apart.
  const urlMatchedId = matchAppForPath(pathname, apps)?.id;
  const defaultPath = defaultApp(apps)?.path;

  // Canonicalize a path that matches no app to the default app (the one declaring
  // `default: true`, else the only/first registered app). This is the ONLY raw
  // `replaceState` redirect in the app, and it is DESTRUCTIVE — it overwrites the
  // address bar — so it must never fire on a URL that could still resolve.
  //
  // - Bare `/` ⇒ redirect immediately: there is nothing to destroy, and this
  //   keeps the common cold-start instant.
  // - A non-bare unmatched path ⇒ redirect ONLY once the deferred tier has
  //   SETTLED and no app shell failed to load. While loading, an app shell whose
  //   `path` owns this URL may still register; redirecting now would wipe a valid
  //   deep link. If a shell failed, we render an error surface instead of ever
  //   destroying the URL (see the suppressed-surface branch below).
  useEffect(() => {
    if (
      shouldRedirectToDefaultApp({
        matched: !!urlMatchedId,
        hasDefault: !!defaultPath,
        isBareRoot: pathname === "/",
        deferredComplete,
        anyAppShellLoadError,
      })
    ) {
      redirectTo(defaultPath!);
    }
  }, [pathname, urlMatchedId, defaultPath, deferredComplete, anyAppShellLoadError]);

  // While the redirect is suppressed for a non-bare unmatched path, show a
  // loading (still settling) or error (a shell failed) surface in the tabs area
  // instead of letting the seed tab paint the default app at the wrong URL.
  const suppressed = !urlMatchedId && !!defaultPath && pathname !== "/";
  const showLoadError = suppressed && deferredComplete && anyAppShellLoadError;
  const showLoading = suppressed && !deferredComplete;

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
          <TabBarHost />
          {/* eslint-disable-next-line layout/no-adhoc-layout -- flexible fill leaf below the rigid tab bar; bounds the framed surface's own scroll */}
          <div className="min-h-0 min-w-0 flex-1">
            {showLoadError ? (
              <AppLoadErrorSurface />
            ) : showLoading ? (
              <Center className="size-full">
                <Loading variant="spinner" label="Loading…" />
              </Center>
            ) : (
              <FramedSurface />
            )}
          </div>
        </Stack>
      </TabsProvider>
    </TooltipProvider>
  );
}

/**
 * Shown in the tabs area when the default-app redirect is suppressed because an
 * app shell failed to load (settled + unhealthy). We never destroy the URL in
 * this state, so the user gets a plain Retry (full reload) instead of a silent
 * jump to the homepage. Mirrors the route-fallback plugin's app-load-error copy.
 */
function AppLoadErrorSurface() {
  return (
    <Center className="size-full">
      <Stack gap="sm" align="center">
        <Stack gap="2xs" align="center">
          <Text variant="heading">Couldn't load the app</Text>
          <Text variant="body" tone="muted">
            Part of the app failed to load. Reloading usually fixes it.
          </Text>
        </Stack>
        <Button variant="outline" onClick={() => location.reload()}>
          Retry
        </Button>
      </Stack>
    </Center>
  );
}

/** Renders the tab strip via the `Apps.TabBar` slot; nothing when no
 * contributor is present (chrome-less surface — the tab bar is opt-in). */
function TabBarHost() {
  const tabBar = Apps.TabBar.useContributions()[0];
  return tabBar
    ? renderIsolated(Apps.TabBar.id, tabBar as unknown as Contribution, {})
    : null;
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
    <RaillessFraming {...props} />
  );
}
