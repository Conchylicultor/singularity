import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";

import {
  PluginProvider,
  markDeferredLoadComplete,
  type LoadedPlugin,
} from "@plugins/framework/plugins/web-sdk/core";
import {
  defaultStore,
  Pane,
  setLiveStore,
  usePaneRoute,
  useSyncPaneRegistry,
} from "@plugins/primitives/plugins/pane/web";

// Regression: a cold deep-link reload must not flash the app's index/landing
// pane at the deep-link URL.
//
// `parseUrl` scans the pane registry to match URL segments, so before a
// deferred-tier plugin registers its pane, the deep link matches nothing and
// yields an EMPTY route — indistinguishable at the route level from the bare
// app root. `usePaneRoute` used to `return route ?? index`, so an empty route
// fell back to the index pane and the homepage rendered at the deep-link URL
// (the URL never changes — routing is route-first). The fix suppresses the
// index fallback for a deep-link URL while the deferred tier is still settling,
// so the layout shows its DeferredRouteFallback loader instead.

// The app's index/landing pane: empty segment + `appPath` makes it the index
// for `/app`. It is the ONLY pane we register — the deep link intentionally
// matches nothing, reproducing the "target pane not yet loaded" gap.
const indexPane = Pane.define({
  id: "deep-link-test-index",
  segment: "",
  appPath: "/app",
  component: () => null,
});

const testPlugin = {
  id: "deep-link-test-plugin",
  description: "deep-link load-gap test fixture",
  contributions: [Pane.Register({ pane: indexPane })],
} as unknown as LoadedPlugin;

/** Probes what `usePaneRoute` resolves to: a pane id chain, or "null". */
function Probe({ basePath }: { basePath: string }) {
  const match = usePaneRoute(basePath);
  const label = match === null ? "null" : match.panes.map((p) => p.pane.id).join(",");
  return <div data-testid="out">{label}</div>;
}

const realLocation = window.location;

/**
 * Point `window.location.pathname` at a cold-load URL. Both `usePathname()` and
 * the live store's `handleLocationChange` read only `.pathname`, and default
 * `history.state` is null, so the store re-derives its route from the URL (as a
 * cold load does) rather than restoring a serialized route. A location stub (not
 * a `history.pushState`/`navigate` call) is the right unit-test seam here: there
 * is no tab/appId to keep in sync, which is all `navigate()` would add.
 */
function setPath(pathname: string): void {
  Object.defineProperty(window, "location", {
    configurable: true,
    writable: true,
    value: { pathname },
  });
}

function resolveAt(pathname: string): string {
  setPath(pathname);
  const { getByTestId } = render(
    <PluginProvider plugins={[testPlugin]}>
      <Probe basePath="/app" />
    </PluginProvider>,
  );
  return getByTestId("out").textContent ?? "";
}

beforeAll(() => {
  // Populate the module-global pane registry with the index pane so both
  // `parseUrl` (for the empty-route path) and `useIndexMatch` can see it.
  render(
    <PluginProvider plugins={[testPlugin]}>
      <RegistrySync />
    </PluginProvider>,
  );
  cleanup();
});

function RegistrySync() {
  useSyncPaneRegistry();
  return null;
}

beforeEach(() => {
  setLiveStore(defaultStore);
});

afterEach(() => {
  cleanup();
  setLiveStore(defaultStore);
  Object.defineProperty(window, "location", {
    configurable: true,
    writable: true,
    value: realLocation,
  });
});

describe("deep-link load gap", () => {
  // The deferred tier starts un-settled (module default), so these two run
  // before we mark it complete below.
  it("suppresses the index fallback for a deep-link URL while the deferred tier is loading", () => {
    // `/app/thing/123` matches no registered pane → empty route. The deep-link
    // path must NOT fall back to the index pane — it resolves to null so the
    // layout renders DeferredRouteFallback.
    expect(resolveAt("/app/thing/123")).toBe("null");
  });

  it("still shows the index pane at the bare app root", () => {
    // No deep-link segments → genuine bare root → index pane is correct.
    expect(resolveAt("/app")).toBe("deep-link-test-index");
  });

  it("falls back to the index pane once the deferred tier has settled (unchanged no-match behavior)", () => {
    // After the deferred tier completes, an empty route for a deep link is a
    // genuine no-match, not a load gap — prior index-fallback behavior stands.
    markDeferredLoadComplete();
    expect(resolveAt("/app/thing/123")).toBe("deep-link-test-index");
  });
});
