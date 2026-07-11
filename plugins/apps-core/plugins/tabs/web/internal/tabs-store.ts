import { getTabId } from "@plugins/primitives/plugins/tab-id/web";
import {
  stripBasePath,
  type PaneOptions,
  type PaneSlot,
  type PaneStore,
} from "@plugins/primitives/plugins/pane/web";
import type { Placement } from "@plugins/apps-core/core";
import type { ActiveApp } from "@plugins/apps-core/web";

/**
 * One open app tab. Each tab owns its own {@link PaneStore} (independent route
 * + base path), so the same app can appear in multiple tabs and a background
 * tab keeps its route while another is focused. Exactly one store is `live` at
 * a time (the focused tab's); the tab manager flips liveness on focus switch.
 *
 * A tab carries NO spatial/placement state. The surface renders every tab under
 * the ONE {@link Placement} the surface is currently in (see
 * {@link PersistedTabs.mode}) — docked / windows / solo are mutually-exclusive
 * *surface* modes, not per-tab states. A single mode value makes "solo and
 * windows visible at once" structurally unrepresentable. Window geometry (only
 * meaningful in windows mode) lives in the floating plugin's own store, keyed by
 * tabId — never on the tab itself.
 */
export interface Tab {
  tabId: string;
  appId: string;
  store: PaneStore;
}

/**
 * Serialized slot shape persisted in sessionStorage. Mirrors the shape pane.ts
 * writes into `history.state.route` (paneId/params/options/uuid) so a restored
 * tab rebuilds an identical route via `store.restoreRoute(...)`.
 *
 * A pane's `hint` is NOT persisted — it is an optimistic mirror of server-owned
 * state that must not outlive the navigation that created it (see `Hint`).
 */
export interface PersistedSlot {
  paneId: string;
  params: Record<string, string>;
  // Mirrors PaneSlot.options (the opener-supplied partial). Persisted via JSON
  // (sessionStorage), which round-trips booleans/numbers/nested objects — so it
  // is the structured PaneOptions bag, not a string map.
  options: PaneOptions;
  uuid: string;
}

export interface PersistedTab {
  tabId: string;
  appId: string;
  route: PersistedSlot[];
  /**
   * The tab's current app-relative URL path, normalized SLASH-TRIMMED (no
   * leading/trailing slash; `""` for a bare app root) — the same normalization
   * `parseUrl` applies to a URL before matching (see {@link normalizeRawPath}).
   * Persisted for EVERY tab and used as the cold-boot discriminator: a resolved
   * tab stores the URL its `route` maps to, while a pending (unresolved) tab
   * stores `route: []` plus the rawPath it is waiting to resolve. On the next
   * boot, `bootTabs` compares this against the address bar — an exact match on
   * the focused tab restores its persisted `route` instantly (no spinner, no
   * registry), while a mismatch seeds a pending route instead of showing a stale
   * pane. Optional so payloads written before this field load unchanged.
   */
  rawPath?: string;
}

export interface PersistedTabs {
  tabs: PersistedTab[];
  focusedTabId: string;
  /**
   * The single surface rendering mode (docked / windows / solo). Optional for
   * back-compat: payloads written before the per-surface mode (which stored a
   * per-tab `placement` instead) restore at the registry default mode.
   */
  mode?: Placement;
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
    options: s.options,
    uuid: s.uuid,
  }));
}

/**
 * The single rawPath normalization for the persisted-tabs discriminator: strip
 * leading/trailing slashes, mapping the bare root ("/" or "") to "". Byte-for-byte
 * the same normalization `parseUrl` applies (its `rawPath` output), so a persisted
 * rawPath compares equal to `parseUrl(...).rawPath` for the same URL.
 */
function normalizeRawPath(path: string): string {
  return path === "/" ? "" : path.replace(/^\/+|\/+$/g, "");
}

/**
 * The app-relative rawPath to persist for a tab, normalized as
 * {@link normalizeRawPath}. Derivation avoids `buildRouteUrl` (which throws on a
 * pane that is not registered yet — routine during the deferred-load window when
 * a background tab's app has not loaded):
 *
 * - **unresolved (pending)** ⇒ the store's own `rawPath`.
 * - **resolved bare root** ⇒ `""`.
 * - **resolved, live (focused) tab** ⇒ derived from the address bar: the live
 *   store's URL mirrors its resolved route, so the app-relative pathname IS the
 *   rawPath `buildRouteUrl(route)` would produce — but without touching the pane
 *   registry, so it never throws even for an instant-restored deep link whose
 *   panes have not loaded yet.
 * - **resolved, background tab** ⇒ carry forward the previously-persisted rawPath.
 *   A background tab's route is immutable while unfocused, so its rawPath still
 *   describes it; rebuilding from its (possibly unregistered) panes would throw.
 */
function rawPathForTab(
  tab: Tab,
  prevRawByTab: ReadonlyMap<string, string | undefined>,
): string | undefined {
  const state = tab.store.getRouteState();
  if (state.kind === "unresolved") return state.rawPath;
  if (state.slots.length === 0) return "";
  if (tab.store.live) {
    return normalizeRawPath(
      stripBasePath(window.location.pathname, tab.store.getBasePath()),
    );
  }
  return prevRawByTab.get(tab.tabId);
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
export function savePersistedTabs(
  tabs: Tab[],
  focusedTabId: string,
  mode: Placement,
): void {
  if (typeof window === "undefined") return;
  // Read the prior payload so a resolved BACKGROUND tab can carry forward its
  // rawPath (see rawPathForTab). Safe: bootTabs already read this key once and
  // fails loud on genuine corruption, so a present key is well-formed here.
  const prev = loadPersistedTabs();
  const prevRawByTab = new Map<string, string | undefined>(
    (prev?.tabs ?? []).map((t) => [t.tabId, t.rawPath] as const),
  );
  const payload: PersistedTabs = {
    tabs: tabs.map((t) => ({
      tabId: t.tabId,
      appId: t.appId,
      route: serializeRoute(t.store),
      rawPath: rawPathForTab(t, prevRawByTab),
    })),
    focusedTabId,
    mode,
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
