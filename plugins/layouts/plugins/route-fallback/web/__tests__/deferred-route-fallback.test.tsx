import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";

import {
  markDeferredLoadComplete,
  markDeferredPluginsFailed,
  resetDeferredLoadStateForTests,
} from "@plugins/framework/plugins/web-sdk/core";
import {
  createPaneStore,
  PaneLoadScopeContext,
  PaneStoreContext,
  type PaneStore,
} from "@plugins/primitives/plugins/pane/web";
import { DeferredRouteFallback } from "../components/deferred-route-fallback";

// The layout's tri-state fallback surface (pending / not-found / app-load-error)
// reads three inputs: the store's route state (`useRouteState` via the context
// PaneStore), the module-global deferred-load signal, and the app-scope prefix
// (`PaneLoadScopeContext`). We drive all three directly and assert which of the
// three surfaces (delayed spinner / NotFound / error+Retry / blank) it paints.
//
// This suite lives in route-fallback (not pane) on purpose: route-fallback
// already depends on pane, so importing `DeferredRouteFallback` here is legal,
// whereas importing it into a pane test would create a pane → route-fallback web
// edge that cycles with the existing route-fallback → pane dependency (R6).

const SCOPE = "apps/plugins/pages/";

/** Render the fallback bound to `store` under an optional load-scope prefix. */
function renderFallback(store: PaneStore, scope = "") {
  return render(
    <PaneStoreContext.Provider value={store}>
      <PaneLoadScopeContext.Provider value={scope}>
        <DeferredRouteFallback />
      </PaneLoadScopeContext.Provider>
    </PaneStoreContext.Provider>,
  );
}

beforeEach(() => {
  resetDeferredLoadStateForTests();
});

afterEach(() => {
  cleanup();
  resetDeferredLoadStateForTests();
});

describe("DeferredRouteFallback", () => {
  it("bare root (resolved, empty) renders blank — no surface", () => {
    // A fresh store is `resolved []` (bare app root). The fallback only ever
    // renders when the app has no index pane, and paints nothing.
    const store = createPaneStore({ live: false });
    const { container } = renderFallback(store);
    expect(container.textContent).toBe("");
  });

  it("pending (unresolved, still loading) shows the loader, not NotFound/error", () => {
    const store = createPaneStore({ live: false });
    store.seedPending("thing/123");
    const { queryByRole, queryByText } = renderFallback(store, SCOPE);
    // The delayed <Loading variant="spinner"> mounts with role=status.
    expect(queryByRole("status")).not.toBeNull();
    expect(queryByText(/doesn't exist/i)).toBeNull();
    expect(queryByText(/couldn't load/i)).toBeNull();
  });

  it("settled + healthy + unresolved ⇒ NotFound surface", () => {
    const store = createPaneStore({ live: false });
    store.seedPending("thing/123");
    markDeferredLoadComplete();
    const { getByText, queryByText } = renderFallback(store, SCOPE);
    expect(getByText(/doesn't exist/i)).not.toBeNull();
    expect(queryByText(/couldn't load/i)).toBeNull();
  });

  it("settled + load error under this app's scope ⇒ app-load-error surface with Retry", () => {
    const store = createPaneStore({ live: false });
    store.seedPending("thing/123");
    markDeferredLoadComplete();
    // A plugin under THIS app's subtree failed to load ⇒ the app is broken, not
    // the link, so the surface offers a reload instead of NotFound.
    markDeferredPluginsFailed(["apps/plugins/pages/plugins/page-tree"]);
    const { getByText, getByRole, queryByText } = renderFallback(store, SCOPE);
    expect(getByText(/couldn't load/i)).not.toBeNull();
    expect(getByRole("button", { name: /retry/i })).not.toBeNull();
    expect(queryByText(/doesn't exist/i)).toBeNull();
  });

  it("a load error OUTSIDE this app's scope does not turn NotFound into an error", () => {
    const store = createPaneStore({ live: false });
    store.seedPending("thing/123");
    markDeferredLoadComplete();
    // Failure under a DIFFERENT app ⇒ this app is healthy ⇒ still NotFound.
    markDeferredPluginsFailed(["apps/plugins/mail/plugins/inbox"]);
    const { getByText, queryByText } = renderFallback(store, SCOPE);
    expect(getByText(/doesn't exist/i)).not.toBeNull();
    expect(queryByText(/couldn't load/i)).toBeNull();
  });

  it("stale-paneId: a resolved NON-empty route (unresolvable slots), settled + healthy ⇒ NotFound, never blank", () => {
    const store = createPaneStore({ live: false });
    // A leftover history.state route from an old bundle whose panes never
    // register: it is `resolved` but unresolvable, so once settled it gets the
    // same NotFound treatment as an unresolved URL rather than a permanent blank.
    store.restoreRoute([{ paneId: "stale-from-old-bundle", params: {} }]);
    markDeferredLoadComplete();
    const { getByText } = renderFallback(store, SCOPE);
    expect(getByText(/doesn't exist/i)).not.toBeNull();
  });
});
