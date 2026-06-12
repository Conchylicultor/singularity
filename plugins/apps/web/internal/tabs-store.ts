import { getTabId } from "@plugins/primitives/plugins/tab-id/web";
import type { PaneSlot, PaneStore } from "@plugins/primitives/plugins/pane/web";
import type { ActiveApp } from "./use-active-app";

/**
 * One open app tab. Each tab owns its own {@link PaneStore} (independent route
 * + base path), so the same app can appear in multiple tabs and a background
 * tab keeps its route while another is focused. Exactly one store is `live` at
 * a time (the focused tab's); the tab manager flips liveness on focus switch.
 */
export interface Tab {
  tabId: string;
  appId: string;
  store: PaneStore;
}

/**
 * Serialized slot shape persisted in sessionStorage. Mirrors the shape pane.ts
 * writes into `history.state.route` (paneId/params/input/uuid) so a restored
 * tab rebuilds an identical route via `store.restoreRoute(...)`.
 */
export interface PersistedSlot {
  paneId: string;
  params: Record<string, string>;
  input: Record<string, string>;
  uuid: string;
}

export interface PersistedTab {
  tabId: string;
  appId: string;
  route: PersistedSlot[];
}

export interface PersistedTabs {
  tabs: PersistedTab[];
  focusedTabId: string;
}

/** sessionStorage key, namespaced per browser tab via {@link getTabId}. */
function storageKey(): string {
  return "app-tabs:" + getTabId();
}

/** Serialize a store's current route to the persisted slot shape. */
export function serializeRoute(store: PaneStore): PersistedSlot[] {
  return store.getRoute().map((s: PaneSlot) => ({
    paneId: s.paneId,
    params: s.params,
    input: s.input,
    uuid: s.uuid,
  }));
}

/**
 * Read the persisted tab set for this browser tab, or null if none. Throws on
 * a present-but-malformed key — we fail loud rather than silently resetting,
 * so a corruption bug surfaces instead of quietly losing the user's tabs.
 */
export function loadPersistedTabs(): PersistedTabs | null {
  if (typeof window === "undefined") return null;
  const raw = window.sessionStorage.getItem(storageKey());
  if (raw === null) return null;
  const parsed = JSON.parse(raw) as PersistedTabs;
  if (!Array.isArray(parsed.tabs) || typeof parsed.focusedTabId !== "string") {
    throw new Error(
      `Malformed persisted app-tabs payload under "${storageKey()}".`,
    );
  }
  return parsed;
}

/** Persist the live tab set (route serialized per store) to sessionStorage. */
export function savePersistedTabs(tabs: Tab[], focusedTabId: string): void {
  if (typeof window === "undefined") return;
  const payload: PersistedTabs = {
    tabs: tabs.map((t) => ({
      tabId: t.tabId,
      appId: t.appId,
      route: serializeRoute(t.store),
    })),
    focusedTabId,
  };
  window.sessionStorage.setItem(storageKey(), JSON.stringify(payload));
}

/**
 * The base path for an app id, matching apps-layout's rule: an app whose `path`
 * is "/" has an empty base path; otherwise its `path` is the base path. Pane
 * segments are app-local and the base path is the implicit URL prefix.
 */
export function appPathFor(
  appId: string,
  apps: readonly ActiveApp[],
): string {
  const app = apps.find((a) => a.id === appId);
  if (!app) {
    throw new Error(`No registered app for id "${appId}".`);
  }
  return app.path === "/" ? "" : app.path;
}

/** The `Apps.App` contribution for an app id (for rendering its surface). */
export function appContributionFor(
  appId: string,
  apps: readonly ActiveApp[],
): ActiveApp {
  const app = apps.find((a) => a.id === appId);
  if (!app) {
    throw new Error(`No registered app for id "${appId}".`);
  }
  return app;
}
