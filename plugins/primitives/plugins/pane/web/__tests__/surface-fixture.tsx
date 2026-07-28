import type { ReactNode } from "react";

import { PluginProvider } from "@plugins/framework/plugins/web-sdk/core";
import {
  createPaneStore,
  type PaneStore,
  PaneSurfaceProvider,
  setLiveStore,
} from "@plugins/primitives/plugins/pane/web";

// Shared setup for the pane suites: mount a pane surface the way production
// mounts one, instead of hand-picking the contexts a test happens to need.
//
// Hand-picked setups rot silently. `PaneStoreContext` stopped defaulting to
// `defaultStore` (d689683f0) and `PaneMatchContext` was later hoisted from the
// layout renderers into the surface (1e50a2448) — two contract moves in nine
// days, each of which broke whichever suites had assembled a partial tree, and
// neither of which was noticed because nothing runs these suites automatically.
// Going through the real `PaneSurfaceProvider` means the next such move updates
// every suite at once, or fails loudly here rather than in four separate files.
//
// Not a `render()` wrapper but a component, because a suite re-renders the same
// tree with a GROWN plugin list to model a deferred plugin arriving
// (`deep-link-settle-then-register`) — `view.rerender(<TestSurface …>)`.

/** The plugin list `PluginProvider` accepts (test fixtures cast into it). */
type TestPlugins = Parameters<typeof PluginProvider>[0]["plugins"];

/**
 * A pane surface: `PluginProvider` + the real `PaneSurfaceProvider`.
 *
 * `PluginProvider` is not optional even with no plugins — `PaneSurfaceProvider`
 * resolves the route through `useSyncPaneRegistry`, which reads the
 * `Pane.Register` slot and throws outside a plugin provider.
 */
export function TestSurface({
  store,
  plugins = [],
  basePath = "/app",
  children,
}: {
  store: PaneStore;
  plugins?: TestPlugins;
  basePath?: string;
  children: ReactNode;
}): ReactNode {
  return (
    <PluginProvider plugins={plugins}>
      <PaneSurfaceProvider store={store} basePath={basePath}>
        {children}
      </PaneSurfaceProvider>
    </PluginProvider>
  );
}

/**
 * A surface store, bound as the live store so the imperative free functions and
 * the module-level history listener agree with it.
 *
 * `live` defaults to true because `handleLocationChange` returns early for a
 * background store — a `live: false` store never reads `window.location`, so
 * every URL-derived case would resolve empty. Pass `live: false` for a suite
 * that drives its subject directly and wants nothing to do with the URL.
 */
export function createTestSurfaceStore(opts: { live?: boolean } = {}): PaneStore {
  const store = createPaneStore({ live: opts.live ?? true });
  setLiveStore(store);
  return store;
}
