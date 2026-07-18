import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";

import {
  PluginProvider,
  type LoadedPlugin,
} from "@plugins/framework/plugins/web-sdk/core";
import {
  createPaneStore,
  defaultHistoryAdapter,
  defaultStore,
  Pane,
  setHistoryAdapter,
  setLiveStore,
  useSyncPaneRegistry,
  type LocationChange,
} from "@plugins/primitives/plugins/pane/web";

// Proves the `HistoryAdapter` seam the shell-history-snapshot refactor rests on:
// the pane store never touches `window.history` directly — it emits push/replace
// INTENTS through the installed adapter (`commit`), and the ONE module-level
// `popstate` listener is the single caller of `restore()`. A stub adapter lets us
// read the intents verbatim; the `defaultHistoryAdapter` proves standalone
// behavior is unchanged when no shell adapter is installed.
//
// Mirrors `pane-isolation.test.tsx`: a self-contained set of test panes is
// registered into the module-global registry via a minimal PluginProvider +
// `useSyncPaneRegistry`, so `buildRouteUrl` / route mutation have real panes to
// resolve — no full plugin graph, so the suite stays boundary-clean.

const rootPane = Pane.define({
  id: "hist-root",
  segment: "hist",
  component: () => null,
});
const childPane = Pane.define({
  id: "hist-child",
  segment: "c/:id",
  resolve: false,
  component: () => null,
});
// A pane that opts OUT of history (`chrome.history: false`) — its open/close
// mutations REPLACE instead of push, so we can prove the mode is threaded both
// ways through the adapter, not hard-coded.
const noHistoryPane = Pane.define({
  id: "hist-nohistory",
  segment: "nh",
  component: () => null,
  chrome: { history: false },
});

const testPlugin = {
  id: "history-sink-test-plugin",
  description: "history-sink test fixture",
  contributions: [
    Pane.Register({ pane: rootPane }),
    Pane.Register({ pane: childPane }),
    Pane.Register({ pane: noHistoryPane }),
  ],
} as unknown as LoadedPlugin;

function RegistrySync() {
  useSyncPaneRegistry();
  return null;
}

beforeAll(() => {
  // Populate the module-global pane registry so `buildRouteUrl` resolves the
  // test panes. Persists after unmount (registry is module-global).
  render(
    <PluginProvider plugins={[testPlugin]}>
      <RegistrySync />
    </PluginProvider>,
  );
  cleanup();
});

beforeEach(() => {
  window.history.replaceState(null, "", "/");
  setLiveStore(defaultStore);
});

afterEach(() => {
  cleanup();
  // Always restore the default adapter + default live store so a suite never
  // leaks a stub adapter onto the next test (or another suite in this file).
  setHistoryAdapter(defaultHistoryAdapter);
  setLiveStore(defaultStore);
  window.history.replaceState(null, "", "/");
});

describe("commit intents — mode + url + state per the push/replace matrix", () => {
  it("pane open emits a PUSH intent with the correct url and state.route", () => {
    const commit = vi.fn();
    setHistoryAdapter({ commit, restore: vi.fn() });
    const store = createPaneStore({ live: true });
    setLiveStore(store);
    store.setBasePath("");

    store.openPaneImpl(rootPane._internal, {}, { root: true });

    expect(commit).toHaveBeenCalledTimes(1);
    const change = commit.mock.calls[0]![0] as LocationChange;
    expect(change.mode).toBe("push");
    expect(change.url).toBe("/hist");
    expect(change.state).toEqual({
      route: [expect.objectContaining({ paneId: "hist-root", params: {} })],
    });
  });

  it("pane close emits a PUSH intent (chrome.history default) truncating the route", () => {
    const store = createPaneStore({ live: true });
    setLiveStore(store);
    store.setBasePath("");
    store.restoreRoute([
      { paneId: "hist-root", params: {} },
      { paneId: "hist-child", params: { id: "1" } },
    ]);
    const child = store.getRoute()[1]!;

    // Install the recorder AFTER the setup navigation so only the close is seen.
    const commit = vi.fn();
    setHistoryAdapter({ commit, restore: vi.fn() });

    store.close(childPane._internal, child.instanceId);

    expect(commit).toHaveBeenCalledTimes(1);
    const change = commit.mock.calls[0]![0] as LocationChange;
    expect(change.mode).toBe("push");
    expect(change.url).toBe("/hist");
    expect(change.state).toEqual({
      route: [expect.objectContaining({ paneId: "hist-root" })],
    });
  });

  it("pane promote emits a PUSH intent rooted at the promoted pane", () => {
    const store = createPaneStore({ live: true });
    setLiveStore(store);
    store.setBasePath("");
    store.restoreRoute([
      { paneId: "hist-root", params: {} },
      { paneId: "hist-child", params: { id: "1" } },
    ]);
    const child = store.getRoute()[1]!;

    const commit = vi.fn();
    setHistoryAdapter({ commit, restore: vi.fn() });

    store.promote(childPane._internal, child.instanceId);

    expect(commit).toHaveBeenCalledTimes(1);
    const change = commit.mock.calls[0]![0] as LocationChange;
    expect(change.mode).toBe("push");
    expect(change.url).toBe("/c/1");
    expect(change.state).toEqual({
      route: [expect.objectContaining({ paneId: "hist-child", params: { id: "1" } })],
    });
  });

  it("a no-history pane open emits a REPLACE intent (mode threaded both ways)", () => {
    const commit = vi.fn();
    setHistoryAdapter({ commit, restore: vi.fn() });
    const store = createPaneStore({ live: true });
    setLiveStore(store);
    store.setBasePath("");

    store.openPaneImpl(noHistoryPane._internal, {}, { root: true });

    expect(commit).toHaveBeenCalledTimes(1);
    expect((commit.mock.calls[0]![0] as LocationChange).mode).toBe("replace");
  });

  it("navigatePending emits a PUSH intent carrying { pending }", () => {
    const commit = vi.fn();
    setHistoryAdapter({ commit, restore: vi.fn() });
    const store = createPaneStore({ live: true });
    setLiveStore(store);
    store.setBasePath("");

    store.navigatePending("later/42");

    expect(commit).toHaveBeenCalledTimes(1);
    const change = commit.mock.calls[0]![0] as LocationChange;
    expect(change.mode).toBe("push");
    expect(change.state).toEqual({ pending: "later/42" });
  });
});

describe("event contract — popstate restores, programmatic navigation does not", () => {
  it("a real popstate calls exactly adapter.restore(); a shell:navigate does not", () => {
    const restore = vi.fn();
    // Mirror the real commit's side-effect: announce `shell:navigate` (NOT a
    // synthetic popstate). This is the exact contract — programmatic navigation
    // must never reach the popstate listener that drives restore().
    const commit = vi.fn(() => {
      window.dispatchEvent(new CustomEvent("shell:navigate"));
    });
    setHistoryAdapter({ commit, restore });
    const store = createPaneStore({ live: true });
    setLiveStore(store);
    store.setBasePath("");

    store.setRoute([]); // programmatic navigation → commit → shell:navigate
    expect(commit).toHaveBeenCalled();
    expect(restore).not.toHaveBeenCalled();

    window.dispatchEvent(new PopStateEvent("popstate")); // real browser back/forward
    expect(restore).toHaveBeenCalledTimes(1);
  });
});

describe("defaultHistoryAdapter — standalone behavior with no shell adapter", () => {
  it("writes { route } verbatim into history.state, and restore drives handleLocationChange", () => {
    setHistoryAdapter(defaultHistoryAdapter);
    const store = createPaneStore({ live: true });
    setLiveStore(store);
    store.setBasePath("");

    store.restoreRoute([{ paneId: "hist-root", params: {} }]);

    // commit wrote the route payload verbatim (no { tabId, appId } — no shell).
    expect(window.history.state).toMatchObject({ route: [{ paneId: "hist-root" }] });
    expect(window.history.state).not.toHaveProperty("tabId");
    expect(store.getRoute().map((s) => s.paneId)).toEqual(["hist-root"]);

    // Simulate a browser back/forward onto a different entry: the browser has
    // already updated history.state + URL; the popstate listener → restore() →
    // getLiveStore().handleLocationChange() rebuilds the live store from it.
    window.history.pushState(
      { route: [{ paneId: "hist-child", params: { id: "9" }, options: {}, uuid: "u9" }] },
      "",
      "/c/9",
    );
    window.dispatchEvent(new PopStateEvent("popstate"));

    expect(store.getRoute().map((s) => s.paneId)).toEqual(["hist-child"]);
    expect(store.getRoute()[0]!.params.id).toBe("9");
  });
});
