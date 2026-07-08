import { useContext, useEffect } from "react";
import type { Contribution } from "@plugins/framework/plugins/web-sdk/core";
import { renderIsolated } from "@plugins/primitives/plugins/slot-render/web";
import {
  PaneSurfaceProvider,
  PaneBasePathContext,
  useRoute,
  useRouteState,
  useIndexMatch,
  usePaneTitle,
} from "@plugins/primitives/plugins/pane/web";
import {
  SyncStatusProvider,
  SyncStatusIndicator,
} from "@plugins/primitives/plugins/sync-status/web";
import { Apps } from "@plugins/apps-core/web";
import {
  appPathFor,
  loadScopePrefixFor,
  useTabs,
  type Tab,
} from "@plugins/apps-core/plugins/tabs/web";

/**
 * The per-tab render core, shared by every surface arrangement. Mounts the tab's
 * own `PaneSurfaceProvider` (its store + base path), reports its leaf title up to
 * the tabs store, and renders the app surface. Identical for the tabs and desktop
 * arrangements, so both reuse this — keeping the `PaneSurfaceProvider` mounting
 * byte-identical regardless of how the tab is laid out on screen.
 */
export function TabSurface({ tab }: { tab: Tab }) {
  const apps = Apps.App.useContributions();
  const app = apps.find((a) => a.id === tab.appId);
  if (!app) return null;
  return (
    <PaneSurfaceProvider
      store={tab.store}
      basePath={appPathFor(tab.appId, apps)}
      appId={tab.appId}
      surfaceId={tab.tabId}
      loadScopePrefix={loadScopePrefixFor(app._pluginId)}
    >
      <TabTitleReporter tabId={tab.tabId} />
      <SyncStatusProvider>
        {/* `relative` so the indicator's Pin anchors to this surface's corner;
            `size-full` so the app render still fills the surface. */}
        <div className="relative size-full">
          {renderIsolated(Apps.App.id, app as unknown as Contribution)}
          <SyncStatusIndicator />
        </div>
      </SyncStatusProvider>
    </PaneSurfaceProvider>
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
  const state = useRouteState();
  const panes = route?.panes ?? [];
  const leaf = panes.length > 0 ? panes[panes.length - 1]! : null;
  if (leaf) {
    return (
      <LeafTitleReporter
        key={leaf.pane.id}
        tabId={tabId}
        pane={leaf.pane}
        params={leaf.fullParams}
        input={leaf.input}
      />
    );
  }
  // Index title ONLY at a GENUINE bare app root (resolved with zero slots).
  // Anything else that renders no leaf — a pending / not-found URL (unresolved)
  // or a resolved route whose slots don't resolve yet (unresolvable paneIds) —
  // clears the title so the tab bar shows the app name, never a homepage-title
  // misreport during the load gap.
  if (state.kind === "resolved" && state.slots.length === 0) {
    return <IndexTitleReporter key="index" tabId={tabId} />;
  }
  return <TitleClear key="clear" tabId={tabId} />;
}

/**
 * Empty-route fallback: resolves the tab app's index pane (the `appPath`-scoped
 * pane with an empty segment) via {@link useIndexMatch} and publishes its title
 * through the same {@link LeafTitleReporter}/`usePaneTitle` path. This is what
 * lets two same-app index tabs show their index pane's title instead of the bare
 * app name. The base path is read from `PaneBasePathContext`, which this tab's
 * `PaneSurfaceProvider` already provides. Index panes without a configured
 * title clear it, so the tab bar still falls back to the app name.
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
  input: Parameters<typeof usePaneTitle>[2];
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
