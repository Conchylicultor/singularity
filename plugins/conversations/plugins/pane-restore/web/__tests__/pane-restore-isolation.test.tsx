import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";

import {
  PluginProvider,
  type LoadedPlugin,
} from "@plugins/framework/plugins/web-sdk/core";
import {
  createPaneStore,
  defaultStore,
  Pane,
  setLiveStore,
  useSyncPaneRegistry,
} from "@plugins/primitives/plugins/pane/web";
// Importing the barrel registers the module-load popstate/shell:navigate
// listener (`import "./internal/pane-restore-store"`) and exposes the reader.
import { loadRouteForConversation } from "@plugins/conversations/plugins/pane-restore/web";

// Proves the pane-restore save listener does not cross-contaminate between tabs.
// It reads the focused (live) store's route AND its conversation key from the
// same `getRoute()` snapshot, so the persisted entry for a conversation always
// reflects that conversation's own route — switching the focused tab to a second
// conversation never clobbers the first.

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Register the panes the conversation route uses so a live `setRoute` (which the
// save listener observes) can build its URL. `conversation` matches the id the
// listener gates on (`route[0].paneId === "conversation"`).
const conversationPaneDef = Pane.define({
  id: "conversation",
  segment: "c/:convId",
  resolve: false,
  chrome: false,
  component: () => null,
});
const filePaneDef = Pane.define({
  id: "file-pane",
  segment: "f/:path",
  resolve: false,
  chrome: false,
  component: () => null,
});

const testPlugin = {
  id: "pane-restore-test-plugin",
  description: "pane-restore test fixture",
  contributions: [
    Pane.Register({ pane: conversationPaneDef }),
    Pane.Register({ pane: filePaneDef }),
  ],
} as unknown as LoadedPlugin;

function RegistrySync() {
  useSyncPaneRegistry();
  return null;
}

beforeAll(() => {
  render(
    <PluginProvider plugins={[testPlugin]}>
      <RegistrySync />
    </PluginProvider>,
  );
  cleanup();
});

function clearSavedRoutes(): void {
  for (const convId of ["X", "Y"]) localStorage.removeItem("route.restore." + convId);
}

beforeEach(() => {
  clearSavedRoutes();
  setLiveStore(defaultStore);
});

afterEach(() => {
  clearSavedRoutes();
  setLiveStore(defaultStore);
});

describe("pane-restore save listener", () => {
  it("persists each conversation's route under its own key, with no cross-tab clobber", async () => {
    // Tab A — conversation X. A live restoreRoute writes history + dispatches
    // the global shell:navigate the listener saves on.
    const tabA = createPaneStore({ live: true });
    setLiveStore(tabA);
    tabA.restoreRoute([{ paneId: "conversation", params: { convId: "X" } }]);
    await delay(90);

    expect(loadRouteForConversation("X")).toEqual([
      { paneId: "conversation", params: { convId: "X" }, input: {} },
    ]);
    expect(loadRouteForConversation("Y")).toBeNull();

    // Focus switches to Tab B — conversation Y with a deeper route.
    tabA.live = false;
    const tabB = createPaneStore({ live: true });
    setLiveStore(tabB);
    tabB.restoreRoute([
      { paneId: "conversation", params: { convId: "Y" } },
      { paneId: "file-pane", params: { path: "a.ts" } },
    ]);
    await delay(90);

    expect(loadRouteForConversation("Y")).toEqual([
      { paneId: "conversation", params: { convId: "Y" }, input: {} },
      { paneId: "file-pane", params: { path: "a.ts" }, input: {} },
    ]);
    // X's persisted route is untouched by Tab B's navigation.
    expect(loadRouteForConversation("X")).toEqual([
      { paneId: "conversation", params: { convId: "X" }, input: {} },
    ]);
  });
});
