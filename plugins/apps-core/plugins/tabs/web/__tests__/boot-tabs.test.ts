import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  markDeferredLoadComplete,
  markDeferredPluginsFailed,
  resetDeferredLoadStateForTests,
} from "@plugins/framework/plugins/web-sdk/core";
import { getTabId } from "@plugins/primitives/plugins/tab-id/web";
import { bootTabs } from "../internal/use-tabs";
import { isDeadUnresolvedLink } from "../internal/load-scope";
import type { PersistedTabs } from "../internal/tabs-store";

// bootTabs is nearly pure store construction: it reads the address bar + the
// persisted-tabs blob and returns the initial tab set, seeding the focused tab's
// route via the tri-state parse. The pane registry is empty in this file (no
// renderer runs `useSyncPaneRegistry`), so any non-bare deep link parses as
// `unresolved` — exactly the cold-boot "deferred plugin not loaded yet" case the
// four-branch logic exists for.

// bootTabs only reads `.id` / `.path` off each app; cast a plain fixture to the
// sealed contribution list type.
type AppList = Parameters<typeof bootTabs>[0];
const APPS = [{ id: "pages", path: "/pages" }] as unknown as AppList;

/** Minimal in-memory Storage — jsdom's sessionStorage under vitest is inert. */
class MemoryStorage implements Storage {
  private store = new Map<string, string>();
  get length() {
    return this.store.size;
  }
  clear() {
    this.store.clear();
  }
  getItem(k: string) {
    return this.store.has(k) ? this.store.get(k)! : null;
  }
  key(i: number) {
    return [...this.store.keys()][i] ?? null;
  }
  removeItem(k: string) {
    this.store.delete(k);
  }
  setItem(k: string, v: string) {
    this.store.set(k, String(v));
  }
}

const realLocation = window.location;

function setPath(pathname: string): void {
  Object.defineProperty(window, "location", {
    configurable: true,
    writable: true,
    value: { pathname },
  });
}

/** Write the persisted-tabs blob under the exact per-browser-tab storage key. */
function persist(payload: PersistedTabs): void {
  window.sessionStorage.setItem("app-tabs:" + getTabId(), JSON.stringify(payload));
}

/** The focused tab's route state after a boot (reads `window.location`). */
function focusedState() {
  const boot = bootTabs(APPS, "pages");
  const focused = boot.tabs.find((t) => t.tabId === boot.focusedTabId)!;
  return focused.store.getRouteState();
}

beforeEach(() => {
  const mem = new MemoryStorage();
  Object.defineProperty(window, "sessionStorage", { value: mem, configurable: true });
  Object.defineProperty(globalThis, "sessionStorage", { value: mem, configurable: true });
  resetDeferredLoadStateForTests();
});

afterEach(() => {
  Object.defineProperty(window, "location", {
    configurable: true,
    writable: true,
    value: realLocation,
  });
  resetDeferredLoadStateForTests();
});

describe("bootTabs — tri-state focused-tab seeding", () => {
  it("instant-restore: persisted route + rawPath === the URL ⇒ restores the persisted slots, not pending", () => {
    persist({
      tabs: [
        {
          tabId: "t1",
          appId: "pages",
          route: [{ paneId: "page", params: { id: "abc" }, options: {}, uuid: "u1" }],
          rawPath: "page/abc",
        },
      ],
      focusedTabId: "t1",
      mode: "",
    });
    setPath("/pages/page/abc");

    const state = focusedState();
    expect(state.kind).toBe("resolved");
    // restoreRoute (branch 3), NOT clearRoute and NOT seedPending.
    expect(state.kind === "resolved" ? state.slots.map((s) => s.paneId) : null).toEqual([
      "page",
    ]);
  });

  it("different deep link: persisted rawPath ≠ the URL ⇒ seeds a pending route", () => {
    persist({
      tabs: [
        {
          tabId: "t1",
          appId: "pages",
          route: [{ paneId: "page", params: { id: "other" }, options: {}, uuid: "u1" }],
          rawPath: "page/other",
        },
      ],
      focusedTabId: "t1",
      mode: "",
    });
    setPath("/pages/page/abc");

    const state = focusedState();
    expect(state.kind).toBe("unresolved");
    expect(state.kind === "unresolved" ? state.rawPath : null).toBe("page/abc");
  });

  it("bare app root (matched, empty) ⇒ clears to the resolved-empty index route", () => {
    persist({
      tabs: [{ tabId: "t1", appId: "pages", route: [], rawPath: "" }],
      focusedTabId: "t1",
      mode: "",
    });
    setPath("/pages");

    const state = focusedState();
    expect(state.kind).toBe("resolved");
    expect(state.kind === "resolved" ? state.slots.length : -1).toBe(0);
  });
});

describe("bootTabs — snapshot-stable focus across reload", () => {
  // The shell-history-snapshot model relies on a stamped `history.state.tabId`
  // still matching an open tab after a reload. bootTabs rebuilds tabs with their
  // PERSISTED ids, so the focused tab keeps its id when the URL's app matches —
  // this is what makes back/forward keep working across reloads.
  const APPS2 = [
    { id: "pages", path: "/pages" },
    { id: "story", path: "/story" },
  ] as unknown as AppList;

  it("reuses the persisted focused tabId when the URL's app matches (no phantom mint)", () => {
    persist({
      tabs: [{ tabId: "t1", appId: "pages", route: [], rawPath: "" }],
      focusedTabId: "t1",
      mode: "",
    });
    setPath("/pages");

    const boot = bootTabs(APPS2, "pages");
    expect(boot.focusedTabId).toBe("t1");
    expect(boot.tabs.map((t) => t.tabId)).toEqual(["t1"]);
  });

  it("keeps other apps' tabs alive and mints a fresh focused tab for a genuine cross-app deep-link", () => {
    persist({
      tabs: [{ tabId: "t-story", appId: "story", route: [], rawPath: "" }],
      focusedTabId: "t-story",
      mode: "",
    });
    setPath("/pages");

    const boot = bootTabs(APPS2, "pages");
    // The story tab survives (keep-alive), and a fresh pages tab is focused —
    // the genuine deep-link fallback, not a desync-driven phantom.
    expect(boot.tabs.some((t) => t.tabId === "t-story")).toBe(true);
    const focused = boot.tabs.find((t) => t.tabId === boot.focusedTabId)!;
    expect(focused.appId).toBe("pages");
    expect(boot.focusedTabId).not.toBe("t-story");
  });
});

describe("isDeadUnresolvedLink — the navigate() dead-link gate", () => {
  const PREFIX = "apps/plugins/pages/";

  it("while the deferred tier is loading ⇒ not dead (navigate seeds pending)", () => {
    expect(isDeadUnresolvedLink(PREFIX)).toBe(false);
  });

  it("settled + healthy ⇒ dead link (navigate throws)", () => {
    markDeferredLoadComplete();
    expect(isDeadUnresolvedLink(PREFIX)).toBe(true);
  });

  it("settled + a load error under this app's subtree ⇒ not dead (app broken, seeds pending)", () => {
    markDeferredLoadComplete();
    markDeferredPluginsFailed(["apps/plugins/pages/plugins/page-tree"]);
    expect(isDeadUnresolvedLink(PREFIX)).toBe(false);
  });
});
