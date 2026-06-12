import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useSyncExternalStore,
  type ComponentType,
  type ReactNode,
} from "react";
import { defineSlot, type Slot } from "@plugins/framework/plugins/web-sdk/core";
import { Pane as PaneSlots } from "./slots";

// ---------------------------------------------------------------------------
// Type machinery — extract `:param` and `:param*` names from a path template.
// ---------------------------------------------------------------------------

type ParamName<S extends string> = S extends `${infer N}*` ? N : S;

type ExtractParams<Path extends string> = Path extends `${infer Seg}/${infer Rest}`
  ? (Seg extends `:${infer P}` ? { [K in ParamName<P>]: string } : {}) &
      ExtractParams<Rest>
  : Path extends `:${infer P}`
    ? { [K in ParamName<P>]: string }
    : {};

export type InferParams<Path extends string> =
  ExtractParams<Path> extends infer O ? { [K in keyof O]: O[K] } : never;

// ---------------------------------------------------------------------------
// Resolve hook — mandatory for parameterized panes, opt-out with `false`.
// ---------------------------------------------------------------------------

export type ResolveHook<Params extends Record<string, string>> =
  (params: Params) => { pending: boolean; found: boolean };

type HasParams<Path extends string> = keyof InferParams<Path> extends never ? false : true;

type ResolveField<Path extends string> =
  HasParams<Path> extends true
    ? { resolve: ResolveHook<InferParams<Path>> | false }
    : { resolve?: never };

let nextInstanceId = 0;

export interface PaneSlot {
  instanceId: number;
  uuid: string;
  paneId: string;
  params: Record<string, string>;
  input: Record<string, string>;
}

function createSlot(
  paneId: string,
  params: Record<string, string>,
  input: Record<string, string> = {},
  uuid?: string,
): PaneSlot {
  return { instanceId: nextInstanceId++, uuid: uuid ?? crypto.randomUUID(), paneId, params, input };
}

// ---------------------------------------------------------------------------
// `type<T>()` — a phantom marker used to declare the `input` shape at the
// type level. The runtime value is irrelevant; only the generic parameter
// matters.
// ---------------------------------------------------------------------------

export interface TypeMarker<T> {
  readonly __marker: (value: T) => void;
}

export function type<T>(): TypeMarker<T> {
  return { __marker: (_: T) => {} };
}

// ---------------------------------------------------------------------------
// Internal registry. Populated at module-load time by `Pane.define` calls.
// ---------------------------------------------------------------------------

export interface PaneChromeConfig<Params> {
  title?: string | ((params: Params) => string);
  history?: boolean;
  /**
   * Show a close button (leftmost) that calls `pane.close()`. Defaults to
   * `true` for panes with a parent. Set to `false` to hide it (e.g. for
   * top-level panes where "close" has no meaningful destination, or panes
   * that render their own bespoke header).
   */
  close?: boolean;
  /**
   * Show a promote button that detaches this pane from its ancestors and
   * makes it the root of a fresh route. Defaults to `true`; only shown
   * when `depth > 0`. Set to `false` for panes that should never be
   * promoted (e.g. compact side-panels with their own expand action).
   */
  promote?: boolean;
  /**
   * When true, the layout renderer (Miller columns) keeps the pane's
   * component subtree mounted when the column is collapsed, hiding it via
   * `display: none` instead of unmounting. Use for panes with live
   * connections (e.g. terminal) to avoid a reconnect cycle on re-expand.
   */
  keepMountedWhenCollapsed?: boolean;
}

interface NormalizedChrome {
  enabled: boolean;
  title?: string | ((params: Record<string, string>) => string);
  history: boolean;
  close: boolean;
  promote: boolean;
  keepMountedWhenCollapsed: boolean;
}

export interface PaneInternal {
  id: string;
  /** Default ancestors to prepend when opening this pane from scratch (no caller context). */
  defaultAncestors: Array<{ id: string }>;
  /** Own URL segment (no leading slash). Used by the route URL parser/builder. */
  segment: string;
  /**
   * Marks this pane as the index/landing pane for the app whose `Apps.App`
   * `path` equals this value (e.g. "/pages", or "/" for the agent-manager).
   * Only meaningful for root-segment panes ("" / "/"). At a bare app root the
   * route is empty; `useIndexMatch` resolves the index pane whose `appPath`
   * matches the active app's basePath and MillerColumns renders it. There is
   * no global fallback — an app without an `appPath`-scoped index shows an
   * empty main area at its bare root.
   */
  appPath?: string;
  component: ComponentType;
  chrome: NormalizedChrome;
  /** Default column width in pixels. Read by layout renderers (e.g. Miller). */
  width?: number;
  actionsSlot: Slot<{ component: ComponentType; position?: "left" | "right" }>;
  resolve?: ResolveHook<Record<string, string>> | false;
}

// Populated synchronously via useSyncPaneRegistry (called by MillerColumns).
// pane.close / pane.expand / parseUrl read from it; nobody writes to it
// outside the sync hook.
const registry = new Map<string, PaneInternal>();

// Reverse map from a pane's internal record back to its public PaneObject.
// Populated by makePaneObject at define time. Lets callers that only hold a
// PaneInternal (e.g. the resolve guard, which receives MatchEntry.pane) reach
// the object's hooks (useClose/usePromote) to reuse the standard chrome.
const paneObjectByInternal = new WeakMap<PaneInternal, PaneObject<any, any, any>>();

/** Resolve the public PaneObject for an internal pane record. */
export function paneObjectFor(internal: PaneInternal): PaneObject<any, any, any> {
  const obj = paneObjectByInternal.get(internal);
  if (!obj) {
    throw new Error(`No PaneObject registered for pane "${internal.id}".`);
  }
  return obj;
}

// ---------------------------------------------------------------------------
// Path helpers.
// ---------------------------------------------------------------------------

export function matchPath(
  pattern: string,
  pathname: string,
  options: { prefix?: boolean } = {},
): Record<string, string> | null {
  const normalize = (p: string) => {
    if (p === "/" || p === "") return "/";
    return p.replace(/\/+$/, "");
  };
  const patParts = normalize(pattern).split("/");
  const pathParts = normalize(pathname).split("/");

  const params: Record<string, string> = {};
  let pi = 0;
  let xi = 0;
  while (pi < patParts.length) {
    const p = patParts[pi]!;
    if (p.startsWith(":") && p.endsWith("*")) {
      const name = p.slice(1, -1);
      params[name] = decodeURIComponent(pathParts.slice(xi).join("/"));
      return params;
    }
    if (xi >= pathParts.length) return null;
    const x = pathParts[xi]!;
    if (p.startsWith(":")) {
      params[p.slice(1)] = decodeURIComponent(x);
    } else if (p !== x) {
      return null;
    }
    pi++;
    xi++;
  }
  if (!options.prefix && xi !== pathParts.length) return null;
  return params;
}

export interface MatchEntry {
  instanceId: number;
  uuid: string;
  pane: PaneInternal;
  /** Own-only params (only `:name`s from this pane's `segment`). */
  params: Record<string, string>;
  /** All params accumulated from the route root up to and including this pane. */
  fullParams: Record<string, string>;
  /** Caller-provided input data, persisted in the slot (not in the URL). */
  input: Record<string, string>;
}

export interface PaneMatch {
  panes: MatchEntry[];
}

// ---------------------------------------------------------------------------
// Route-based URL parser + builder.
// ---------------------------------------------------------------------------

function segmentParamNames(segment: string): string[] {
  if (!segment) return [];
  return segment
    .split("/")
    .filter((seg) => seg.startsWith(":"))
    .map((seg) => seg.slice(1).replace(/\*$/, ""));
}

function matchSegmentParts(
  segment: string,
  urlSegments: string[],
  cursor: number,
): { params: Record<string, string>; consumed: number } | null {
  if (!segment || segment === "/" || segment === "") return null;

  const segParts = segment.split("/").filter(Boolean);
  if (segParts.length === 0) return null;

  const params: Record<string, string> = {};
  let consumed = 0;

  for (let i = 0; i < segParts.length; i++) {
    const pat = segParts[i]!;
    const idx = cursor + consumed;

    if (pat.startsWith(":") && pat.endsWith("*")) {
      const name = pat.slice(1, -1);
      const rest = urlSegments.slice(idx);
      if (rest.length === 0) return null;
      params[name] = rest.map((s) => decodeURIComponent(s)).join("/");
      return { params, consumed: urlSegments.length - cursor };
    }

    if (idx >= urlSegments.length) return null;

    if (pat.startsWith(":")) {
      params[pat.slice(1)] = decodeURIComponent(urlSegments[idx]!);
    } else if (pat !== urlSegments[idx]) {
      return null;
    }

    consumed++;
  }

  return { params, consumed };
}

export function parseUrl(pathname: string): PaneSlot[] | null {
  const normalized =
    pathname === "/" ? "" : pathname.replace(/^\/+|\/+$/g, "");
  const urlSegments = normalized ? normalized.split("/") : [];

  let cursor = 0;
  const route: PaneSlot[] = [];

  while (cursor < urlSegments.length) {
    let bestMatch: {
      pane: PaneInternal;
      params: Record<string, string>;
      consumed: number;
    } | null = null;

    for (const pane of registry.values()) {
      const result = matchSegmentParts(pane.segment, urlSegments, cursor);
      if (!result) continue;
      if (!bestMatch || result.consumed > bestMatch.consumed) {
        bestMatch = { pane, params: result.params, consumed: result.consumed };
      }
    }

    if (!bestMatch) return null;

    route.push(createSlot(bestMatch.pane.id, bestMatch.params));
    cursor += bestMatch.consumed;
  }

  // A bare app root (basePath-stripped pathname is "/") yields an EMPTY route.
  // The index/landing pane is NOT injected here: it is a main-area-renderer
  // concern, resolved by `useIndexMatch` (see below) and rendered only by
  // MillerColumns. Keeping it out of the route store means an overlay host
  // (e.g. Sonata's PaneOverlayHost) sees "nothing opened" at a bare root and
  // renders no overlay, instead of inheriting another app's index pane.
  return route.length > 0 ? route : null;
}

export function buildRouteUrl(route: PaneSlot[]): string {
  if (route.length === 0) return "/";

  const parts: string[] = [];
  for (const slot of route) {
    const pane = registry.get(slot.paneId);
    if (!pane) throw new Error(`Unknown pane: ${slot.paneId}`);
    if (!pane.segment || pane.segment === "/" || pane.segment === "") continue;

    const segParts = pane.segment.split("/").filter(Boolean);
    for (const seg of segParts) {
      if (!seg.startsWith(":")) {
        parts.push(seg);
      } else {
        const wildcard = seg.endsWith("*");
        const name = seg.slice(1).replace(/\*$/, "");
        const val = slot.params[name];
        if (val === undefined) {
          throw new Error(
            `Missing param "${name}" for pane "${pane.id}"`,
          );
        }
        if (wildcard) {
          parts.push(...val.split("/").map(encodeURIComponent));
        } else {
          parts.push(encodeURIComponent(val));
        }
      }
    }
  }

  return "/" + parts.join("/") || "/";
}

// ---------------------------------------------------------------------------
// Layout route store — the primary source of truth for what's on screen.
//
// All per-route mutable state (`currentRoute`, `routeListeners`,
// `currentBasePath`, `prevResolvedByUuid`) plus the methods that read/write it
// live inside a `PaneStore` instance built by `createPaneStore()`. The pane
// *definitions* (`registry`, `paneObjectByInternal`, `indexInstanceIds`,
// `nextInstanceId`) stay module-global — one shared set across all stores.
//
// A `live` flag gates the side-effects that mirror the route to the browser
// (`window.history`, `popstate`/`shell:navigate` dispatch, `applyBasePath`).
// A live store behaves exactly like the historical module globals; a
// background store updates its in-memory route + notifies its own listeners
// only. Phase 2 (per-tab tabs) creates one store per tab and flips `live` on
// the focused one.
// ---------------------------------------------------------------------------

export interface PaneStore {
  /** Current in-memory route (the authoritative source of truth). */
  getRoute(): PaneSlot[];
  /** Snapshot for `useSyncExternalStore` (identity-stable until mutation). */
  getRouteSnapshot(): PaneSlot[];
  /** Subscribe to route changes; returns an unsubscribe. */
  subscribeRoute(cb: () => void): () => void;
  /** Replace the route. Mirrors to the browser when `live`. */
  setRoute(route: PaneSlot[], replace?: boolean): void;
  /** Re-derive the route from a (base-path-stripped) URL pathname. */
  syncRouteFromUrl(pathname: string): void;
  /** popstate/shell:navigate handler — restore from history.state or URL. */
  handleLocationChange(): void;
  reorderRoute(fromIndex: number, toIndex: number): void;
  restoreRoute(
    slots: Array<{ paneId: string; params: Record<string, string>; input?: Record<string, string> }>,
  ): void;
  clearRoute(): void;
  /** Resolve the current route to a `PaneMatch` (memo-friendly, per-store). */
  resolveRoute(route: PaneSlot[]): PaneMatch | null;
  setBasePath(basePath: string): void;
  getBasePath(): string;
  /** Open a pane (non-positional). Used by `promote` and the open hooks. */
  openPaneImpl(
    internal: PaneInternal,
    params: Record<string, string>,
    opts?: { root?: boolean; input?: Record<string, string> },
  ): void;
  close(internal: PaneInternal, instanceId: number): void;
  unwrap(instanceId: number): void;
  promote(internal: PaneInternal, instanceId: number): void;
  /** Whether route mutations mirror to the browser URL/history. */
  live: boolean;
}

function createPaneStore(opts: { live: boolean } = { live: false }): PaneStore {
  let currentRoute: PaneSlot[] = [];
  const routeListeners = new Set<() => void>();
  let currentBasePath = "";
  let prevResolvedByUuid = new Map<string, MatchEntry>();

  function notifyRouteListeners(): void {
    for (const fn of routeListeners) fn();
  }

  function applyBasePath(rawUrl: string): string {
    if (!currentBasePath) return rawUrl;
    if (rawUrl === "/") return currentBasePath;
    return currentBasePath + rawUrl;
  }

  function setRoute(route: PaneSlot[], replace = false): void {
    currentRoute = route;
    notifyRouteListeners();
    // Background stores update in-memory route + notify their own listeners
    // only; they never touch the browser URL/history.
    if (!store.live) return;
    const url = buildRouteUrl(route);
    const serialized = route.map(s => ({ paneId: s.paneId, params: s.params, input: s.input, uuid: s.uuid }));
    const fullUrl = applyBasePath(url);
    if (fullUrl === window.location.pathname && replace) return;
    const method = replace ? "replaceState" : "pushState";
    window.history[method]({ route: serialized }, "", fullUrl);
    window.dispatchEvent(new PopStateEvent("popstate"));
    window.dispatchEvent(new CustomEvent("shell:navigate"));
  }

  function reorderRoute(fromIndex: number, toIndex: number): void {
    if (typeof window === "undefined") return;
    const route = [...currentRoute];
    if (fromIndex < 0 || fromIndex >= route.length) return;
    if (toIndex < 0 || toIndex >= route.length) return;
    if (fromIndex === toIndex) return;
    const [item] = route.splice(fromIndex, 1);
    route.splice(toIndex, 0, item!);
    setRoute(route);
  }

  function restoreRoute(
    slots: Array<{ paneId: string; params: Record<string, string>; input?: Record<string, string> }>,
  ): void {
    if (typeof window === "undefined") return;
    const route: PaneSlot[] = slots.map((s) => createSlot(s.paneId, s.params, s.input ?? {}));
    if (route.length === 0) return;
    setRoute(route);
  }

  function clearRoute(): void {
    if (typeof window === "undefined") return;
    setRoute([]);
  }

  function syncRouteFromUrl(pathname: string): void {
    const parsed = parseUrl(pathname);
    const newRoute = parsed ?? [];
    if (routesEqual(currentRoute, newRoute)) return;
    currentRoute = newRoute;
    notifyRouteListeners();
  }

  function resolveRoute(route: PaneSlot[]): PaneMatch | null {
    if (route.length === 0) {
      prevResolvedByUuid = new Map();
      return null;
    }
    const entries: MatchEntry[] = [];
    const accumulated: Record<string, string> = {};
    let routeStable = true;
    for (const slot of route) {
      const pane = registry.get(slot.paneId);
      if (!pane) {
        prevResolvedByUuid = new Map();
        return null;
      }
      Object.assign(accumulated, slot.params);
      const prev = prevResolvedByUuid.get(slot.uuid);
      if (routeStable && prev && prev.pane === pane) {
        entries.push(prev);
      } else {
        routeStable = false;
        entries.push({
          instanceId: slot.instanceId,
          uuid: slot.uuid,
          pane,
          params: { ...slot.params },
          fullParams: { ...accumulated },
          input: { ...slot.input },
        });
      }
    }
    prevResolvedByUuid = new Map(entries.map(e => [e.uuid, e]));
    return { panes: entries };
  }

  function setBasePath(basePath: string): void {
    currentBasePath = normalizeAppPath(basePath);
  }

  function getBasePath(): string {
    return currentBasePath;
  }

  function handleLocationChange(): void {
    if (typeof window === "undefined") return;
    // Only the live (focused) store mirrors the browser URL/history. A
    // background tab's store must NOT read window.location here: every mounted
    // background surface re-runs this via `useSyncPaneRegistry`, and without
    // this gate they would all overwrite their in-memory route with the
    // *focused* tab's URL — destroying keep-alive. Background stores receive
    // their route only from `restoreRoute` (persistence) or from being
    // navigated while focused (held in memory).
    if (!store.live) return;
    const state = window.history.state as { route?: Array<{ paneId: string; params: Record<string, string>; input?: Record<string, string>; uuid?: string }> } | null;
    if (state?.route) {
      const newRoute = state.route.map(s => createSlot(s.paneId, s.params, s.input ?? {}, s.uuid));
      if (routesEqual(currentRoute, newRoute)) return;
      currentRoute = newRoute;
      notifyRouteListeners();
    } else {
      const pathname = stripBasePath(window.location.pathname, currentBasePath);
      syncRouteFromUrl(pathname);
    }
  }

  function openPaneImpl(
    internal: PaneInternal,
    params: Record<string, string>,
    implOpts?: { root?: boolean; input?: Record<string, string> },
  ): void {
    const replace = internal.chrome.enabled && !internal.chrome.history;
    const route = currentRoute;
    const ownParams = extractOwnParams(internal, params);
    const input = implOpts?.input ?? {};

    if (!implOpts?.root) {
      const existingIdx = route.findIndex((s) => s.paneId === internal.id);
      if (existingIdx >= 0) {
        const existing = route[existingIdx]!;
        const sameParams =
          Object.keys(ownParams).length === Object.keys(existing.params).length &&
          Object.keys(ownParams).every((k) => ownParams[k] === existing.params[k]);
        const sameInput =
          Object.keys(input).length === Object.keys(existing.input).length &&
          Object.keys(input).every((k) => input[k] === existing.input[k]);
        if (sameParams && sameInput) return;
        const newRoute = route.slice(0, existingIdx + 1);
        newRoute[existingIdx] = createSlot(internal.id, ownParams, input);
        setRoute(newRoute, replace);
        return;
      }
    }

    // Build fresh route from defaultAncestors
    const ancestorSlots: PaneSlot[] = [];
    for (const ancestor of internal.defaultAncestors) {
      const ancestorInternal = registry.get(ancestor.id);
      if (!ancestorInternal) continue;
      // Inherit params from existing route if available
      const existingSlot = route.find(s => s.paneId === ancestor.id);
      const ancestorParams = existingSlot
        ? existingSlot.params
        : extractOwnParams(ancestorInternal, params);
      ancestorSlots.push(createSlot(ancestor.id, ancestorParams));
    }
    setRoute([...ancestorSlots, createSlot(internal.id, ownParams, input)], replace);
  }

  function close(internal: PaneInternal, instanceId: number): void {
    if (typeof window === "undefined") return;
    const route = currentRoute;
    const idx = route.findIndex((s) => s.instanceId === instanceId);
    if (idx <= 0) return;
    const newRoute = route.slice(0, idx);
    const replace = internal.chrome.enabled && !internal.chrome.history;
    setRoute(newRoute, replace);
  }

  function unwrap(instanceId: number): void {
    if (typeof window === "undefined") return;
    const route = currentRoute;
    const idx = route.findIndex((s) => s.instanceId === instanceId);
    if (idx < 0) return;
    const newRoute = [...route.slice(0, idx), ...route.slice(idx + 1)];
    setRoute(newRoute);
  }

  function promote(internal: PaneInternal, instanceId: number): void {
    if (typeof window === "undefined") return;
    const route = currentRoute;
    const idx = route.findIndex((s) => s.instanceId === instanceId);
    if (idx < 0) return;
    const fullParams: Record<string, string> = {};
    for (let i = 0; i <= idx; i++) {
      Object.assign(fullParams, route[i]!.params);
    }
    openPaneImpl(internal, fullParams, { root: true, input: route[idx]!.input });
  }

  const store: PaneStore = {
    getRoute: () => currentRoute,
    getRouteSnapshot: () => currentRoute,
    subscribeRoute: (cb) => {
      routeListeners.add(cb);
      return () => routeListeners.delete(cb);
    },
    setRoute,
    syncRouteFromUrl,
    handleLocationChange,
    reorderRoute,
    restoreRoute,
    clearRoute,
    resolveRoute,
    setBasePath,
    getBasePath,
    openPaneImpl,
    close,
    unwrap,
    promote,
    live: opts.live,
  };

  return store;
}

// The default store mirrors the historical module-global behavior exactly: it
// is live and is the initial `liveStore` that the imperative free functions
// and the (single) module-level window listener delegate to. With exactly one
// store (Phase 1) everything behaves identically to before.
const defaultStore = createPaneStore({ live: true });

// The focused store the imperative (non-hook) navigation API targets, AND the
// store the single module-level window listener forwards browser back/forward
// to. Phase 2's tab manager re-points this on focus switch via `setLiveStore`.
let liveStore: PaneStore = defaultStore;

/**
 * Re-point the live store — the target of every imperative (non-hook)
 * navigation call (`openPane`, `getRoute`, `restoreRoute`, …) and of the
 * module-level `popstate`/`shell:navigate` window listener. Phase 2's tab
 * manager calls this when the focused tab changes, after flipping the old
 * store's `live` off and the new store's `live` on; browser back/forward then
 * drives the focused tab's store.
 */
export function setLiveStore(store: PaneStore): void {
  liveStore = store;
}

// Exactly ONE module-level window listener for the whole app. It forwards to
// whichever store is currently live (set via `setLiveStore`). Since
// `liveStore === defaultStore` until the tab manager repoints it, Phase 1
// behavior is unchanged; in tab mode browser back/forward drives the focused
// tab's store. The tab provider must NOT add a second listener.
if (typeof window !== "undefined") {
  const forwardToLiveStore = () => {
    liveStore.handleLocationChange();
  };
  window.addEventListener("popstate", forwardToLiveStore);
  window.addEventListener("shell:navigate", forwardToLiveStore);
}

export { createPaneStore, defaultStore };

// ---------------------------------------------------------------------------
// PaneStore React context. `usePaneStore()` reads the context, falling back to
// the module-level `defaultStore` when no provider is present — this preserves
// today's behavior everywhere not yet wrapped in a `PaneSurfaceProvider`.
// ---------------------------------------------------------------------------

export const PaneStoreContext = createContext<PaneStore>(defaultStore);

export function usePaneStore(): PaneStore {
  return useContext(PaneStoreContext);
}

/**
 * Single provider supplying BOTH the active {@link PaneStore} (via
 * {@link PaneStoreContext}) and the app base path (via the existing
 * {@link PaneBasePathContext}) to a pane surface. The layout renderers
 * (miller / full-pane / host / overlay) read the store implicitly through the
 * route hooks and the base path through `PaneBasePathContext`, so wrapping a
 * subtree in this provider rebinds its entire route to `store` with no renderer
 * changes. Phase 2 mounts one `PaneSurfaceProvider` per tab.
 */
export function PaneSurfaceProvider({
  store,
  basePath,
  children,
}: {
  store: PaneStore;
  basePath: string;
  children: ReactNode;
}): ReactNode {
  return createElement(
    PaneStoreContext.Provider,
    { value: store },
    createElement(PaneBasePathContext.Provider, { value: basePath }, children),
  );
}

// ---------------------------------------------------------------------------
// Imperative (non-hook) route API — delegates to the live store. Keeps the
// ~40 imperative call sites and external consumers (pane-restore, miller drag,
// library/story/conversation-list) untouched.
// ---------------------------------------------------------------------------

export function getRoute(): PaneSlot[] {
  return liveStore.getRoute();
}

export function reorderRoute(fromIndex: number, toIndex: number): void {
  liveStore.reorderRoute(fromIndex, toIndex);
}

export function restoreRoute(
  slots: Array<{ paneId: string; params: Record<string, string>; input?: Record<string, string> }>,
): void {
  liveStore.restoreRoute(slots);
}

/**
 * Navigate to the EMPTY route — the only public way to do so. `restoreRoute`
 * refuses an empty array and `setRoute` is store-internal, so full-pane apps
 * had no way to go "back to index" (e.g. ← Library). `setRoute([])` builds URL
 * "/" (→ the app root via applyBasePath), pushes history, and notifies; the
 * empty route then re-resolves to the index pane via `useIndexMatch`.
 */
export function clearRoute(): void {
  liveStore.clearRoute();
}

export function setBasePath(basePath: string): void {
  liveStore.setBasePath(basePath);
}

export function getBasePath(): string {
  return liveStore.getBasePath();
}

function useRouteSlots(): PaneSlot[] {
  const store = usePaneStore();
  return useSyncExternalStore(store.subscribeRoute, store.getRouteSnapshot, () => []);
}

function routesEqual(a: PaneSlot[], b: PaneSlot[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i]!.paneId !== b[i]!.paneId) return false;
    const ak = Object.keys(a[i]!.params);
    const bk = Object.keys(b[i]!.params);
    if (ak.length !== bk.length) return false;
    for (const k of ak) {
      if (a[i]!.params[k] !== b[i]!.params[k]) return false;
    }
    const ai = Object.keys(a[i]!.input);
    const bi = Object.keys(b[i]!.input);
    if (ai.length !== bi.length) return false;
    for (const k of ai) {
      if (a[i]!.input[k] !== b[i]!.input[k]) return false;
    }
  }
  return true;
}

function extractOwnParams(
  pane: PaneInternal,
  allParams: Record<string, string>,
): Record<string, string> {
  const names = segmentParamNames(pane.segment);
  const own: Record<string, string> = {};
  for (const name of names) {
    if (name in allParams) own[name] = allParams[name]!;
  }
  return own;
}

// ---------------------------------------------------------------------------
// Router contexts.
// ---------------------------------------------------------------------------

export const PaneMatchContext = createContext<PaneMatch | null>(null);
export const PaneInstanceContext = createContext<number | undefined>(undefined);

export function usePaneMatch(): PaneMatch | null {
  return useContext(PaneMatchContext);
}

export function useCurrentPane(): PaneInternal | null {
  const match = useContext(PaneMatchContext);
  const instanceId = useContext(PaneInstanceContext);
  if (!match || instanceId === undefined) return null;
  return match.panes.find(e => e.instanceId === instanceId)?.pane ?? null;
}

// ---------------------------------------------------------------------------
// App-scoped basePath. The active app's path (e.g. "/debug") is an implicit
// URL prefix: navigate() prepends it, MillerColumns strips it before matching.
// Pane segments stay app-local — no manual prefix needed.
// ---------------------------------------------------------------------------

export const PaneBasePathContext = createContext<string>("");

// `setBasePath` / `getBasePath` are the imperative delegations to the live
// store (declared above near the other imperative free functions). The per-
// store base path now lives inside each `PaneStore`; only these helpers stay
// module-level because they are pure (no per-store state) and shared.

/** Normalize an app path to the store's base-path shape ("/" → ""). */
function normalizeAppPath(path: string): string {
  return path === "/" ? "" : path.replace(/\/+$/, "");
}

export function stripBasePath(pathname: string, basePath: string): string {
  const bp = basePath === "/" ? "" : basePath.replace(/\/+$/, "");
  if (!bp) return pathname;
  if (pathname === bp) return "/";
  if (pathname.startsWith(bp + "/")) return pathname.slice(bp.length);
  return pathname;
}

// The `popstate` / `shell:navigate` window listeners are wired exactly once at
// module load (near `setLiveStore` above) and forward to the current live
// store. Phase 2's tab manager owns liveness (via `setLiveStore`); browser
// events are routed to whichever store is focused.

// ---------------------------------------------------------------------------
// Navigation + location hook.
// ---------------------------------------------------------------------------

export function usePathname(): string {
  return useSyncExternalStore(
    (cb) => {
      window.addEventListener("popstate", cb);
      window.addEventListener("shell:navigate", cb);
      return () => {
        window.removeEventListener("popstate", cb);
        window.removeEventListener("shell:navigate", cb);
      };
    },
    () => window.location.pathname,
    () => "/",
  );
}

// ---------------------------------------------------------------------------
// PaneObject — the value returned by `Pane.define`.
// ---------------------------------------------------------------------------

/**
 * Typed handle returned by `Pane.define`.
 *
 * `FullParams` is the full resolved param set including ancestors — used for
 * `open()`. `OwnParams` is only the `:name`s declared in this pane's own
 * `segment` — what `useParams()` returns. Keeping them separate matches
 * design decision 6 ("params are own-only").
 */
export interface PaneToggleOpts {
  action?: "close" | "unwrap";
  side?: "left" | "right";
  mode?: PaneOpenMode;
  input?: Record<string, string>;
}

export interface PaneRouteEntry<OwnParams = Record<string, string>> {
  instanceId: number;
  uuid: string;
  params: OwnParams;
  fullParams: Record<string, string>;
  input: Record<string, string>;
}

export interface PaneObject<
  FullParams = {},
  OwnParams = FullParams,
  Input = Record<string, string>,
> {
  id: string;
  useParams(): OwnParams;
  /** Read the caller-provided input data for this pane (persisted in the slot, not in the URL). */
  useInput(): Input;
  /** Find this pane in the current route. Returns its params or null if absent. */
  useRouteEntry(): PaneRouteEntry<OwnParams> | null;
  /** Find all instances of this pane in the current route (for panes that can appear multiple times). */
  useRouteEntries(): PaneRouteEntry<OwnParams>[];
  close(instanceId: number): void;
  /** Remove this pane from the route while preserving its children. */
  unwrap(instanceId: number): void;
  /** Detach from ancestors and make this pane the root of a fresh route. */
  promote(instanceId: number): void;
  /** Hook: returns a bound close function for the current instance, or null if root/not in route. */
  useClose(): (() => void) | null;
  /** Hook: returns a bound promote function for the current instance, or null if root/not in route. */
  usePromote(): (() => void) | null;
  /** Hook: toggle this pane open/closed relative to the caller's position in the route. */
  useToggle(
    params: FullParams,
    opts?: PaneToggleOpts,
  ): { isOpen: boolean; toggle: () => void };
  back(): void;
  forward(): void;
  Actions: Slot<{ component: ComponentType; position?: "left" | "right" }>;
  /** Internal. Consumers should not rely on this. */
  _internal: PaneInternal;
}

function makePaneObject(internal: PaneInternal): PaneObject<any, any, any> {
  const { actionsSlot } = internal;

  function useParams(): Record<string, string> {
    const match = useContext(PaneMatchContext);
    const instanceId = useContext(PaneInstanceContext);
    if (!match) {
      throw new Error(
        `Pane "${internal.id}".useParams() called outside the pane layout renderer.`,
      );
    }
    if (instanceId !== undefined) {
      const entry = match.panes.find(e => e.instanceId === instanceId);
      if (entry?.pane === internal) return entry.params;
    }
    const entry = match.panes.find((e) => e.pane === internal);
    if (!entry) {
      throw new Error(
        `Pane "${internal.id}".useParams() called but pane is not in the current match route.`,
      );
    }
    return entry.params;
  }

  function useInput(): Record<string, string> {
    const match = useContext(PaneMatchContext);
    const instanceId = useContext(PaneInstanceContext);
    if (!match) return {};
    if (instanceId !== undefined) {
      const entry = match.panes.find(e => e.instanceId === instanceId);
      if (entry?.pane === internal) return entry.input;
    }
    const entry = match.panes.find(e => e.pane === internal);
    return entry?.input ?? {};
  }

  function useRouteEntry(): PaneRouteEntry | null {
    const match = useContext(PaneMatchContext);
    if (!match) return null;
    const entry = match.panes.find((e) => e.pane === internal);
    if (!entry) return null;
    return { instanceId: entry.instanceId, uuid: entry.uuid, params: entry.params, fullParams: entry.fullParams, input: entry.input };
  }

  function useRouteEntries(): PaneRouteEntry[] {
    const match = useContext(PaneMatchContext);
    if (!match) return [];
    return match.panes
      .filter((e) => e.pane === internal)
      .map((e) => ({ instanceId: e.instanceId, uuid: e.uuid, params: e.params, fullParams: e.fullParams, input: e.input }));
  }

  // Imperative methods on the PaneObject target the live store (the focused
  // tab's route), matching the historical module-global behavior for external
  // imperative callers (e.g. `conversationPane.close(instanceId)`).
  function close(instanceId: number): void {
    liveStore.close(internal, instanceId);
  }

  function unwrap(instanceId: number): void {
    liveStore.unwrap(instanceId);
  }

  function promote(instanceId: number): void {
    liveStore.promote(internal, instanceId);
  }

  function back(): void {
    if (typeof window !== "undefined") window.history.back();
  }

  function forward(): void {
    if (typeof window !== "undefined") window.history.forward();
  }

  // Hooks read/write the *context* store — the surface they are rendered in.
  function useClose(): (() => void) | null {
    const store = usePaneStore();
    const instanceId = useContext(PaneInstanceContext);
    const route = useRouteSlots();
    return useMemo(() => {
      if (instanceId === undefined) return null;
      const idx = route.findIndex((s) => s.instanceId === instanceId);
      if (idx <= 0) return null;
      return () => store.close(internal, instanceId);
    }, [store, instanceId, route]);
  }

  function usePromote(): (() => void) | null {
    const store = usePaneStore();
    const instanceId = useContext(PaneInstanceContext);
    const route = useRouteSlots();
    return useMemo(() => {
      if (instanceId === undefined) return null;
      const idx = route.findIndex((s) => s.instanceId === instanceId);
      if (idx < 0) return null;
      if (idx === 0) return null;
      return () => store.promote(internal, instanceId);
    }, [store, instanceId, route]);
  }

  function useToggle(
    params: Record<string, string>,
    opts?: PaneToggleOpts,
  ): { isOpen: boolean; toggle: () => void } {
    const store = usePaneStore();
    const callerInstanceId = useContext(PaneInstanceContext);
    const route = useRouteSlots();
    const openPaneFn = useOpenPane();
    const paramsRef = useRef(params);
    paramsRef.current = params;

    const action = opts?.action ?? "close";
    const mode = opts?.mode ?? "push";
    const side = opts?.side;
    const input = opts?.input;
    const inputRef = useRef(input);
    inputRef.current = input;

    const callerIndex =
      callerInstanceId !== undefined
        ? route.findIndex((s) => s.instanceId === callerInstanceId)
        : -1;
    // Search for the toggle's target on the same side it would be opened.
    // `side: "left"` inserts the pane before the caller (as an ancestor), so
    // look to the left; the default right-push appends after the caller, so
    // look to the right. Mismatching the side makes the open-check miss the
    // existing pane and stack a duplicate on every click.
    const searchRegion =
      side === "left"
        ? callerIndex >= 0
          ? route.slice(0, callerIndex)
          : route
        : route.slice(callerIndex >= 0 ? callerIndex + 1 : 0);
    const targetSlot =
      searchRegion.find((s) => s.paneId === internal.id) ?? null;
    const isOpen = targetSlot !== null;

    const toggle = useCallback(() => {
      if (targetSlot) {
        if (action === "unwrap") {
          store.unwrap(targetSlot.instanceId);
        } else {
          store.close(internal, targetSlot.instanceId);
        }
      } else {
        openPaneFn(paneObject, paramsRef.current, { mode, side, input: inputRef.current });
      }
    }, [store, targetSlot, action, openPaneFn, mode, side]);

    return { isOpen, toggle };
  }

  const paneObject: PaneObject<any, any, any> = {
    id: internal.id,
    useParams,
    useInput,
    useRouteEntry,
    useRouteEntries,
    close,
    unwrap,
    promote,
    useClose,
    usePromote,
    useToggle,
    back,
    forward,
    Actions: actionsSlot,
    _internal: internal,
  };
  paneObjectByInternal.set(internal, paneObject);
  return paneObject;
}

function normalizeChrome<Params>(
  chrome: PaneChromeConfig<Params> | false | undefined,
): NormalizedChrome {
  if (chrome === false) {
    return { enabled: false, history: false, close: false, promote: false, keepMountedWhenCollapsed: false };
  }
  return {
    enabled: true,
    title: chrome?.title as NormalizedChrome["title"],
    history: chrome?.history ?? true,
    close: chrome?.close ?? true,
    promote: chrome?.promote ?? true,
    keepMountedWhenCollapsed: chrome?.keepMountedWhenCollapsed ?? false,
  };
}

// ---------------------------------------------------------------------------
// Pane.define — factory + registration.
// ---------------------------------------------------------------------------

// ParentParams defaults to `{}` so that top-level panes (no parent) end up
// with `{} & InferParams<Path>` = `InferParams<Path>`. Using
// `Record<string, never>` as the default would clash with any own params.
type DefineArgs<Path extends string, ParentParams, Input> = {
  id: string;
  /** Optional default ancestors to prepend when opening this pane from scratch (no caller context). */
  defaultAncestors?: Array<PaneObject<any, any, any>>;
  /** Own URL segment (no leading slash). */
  segment?: Path;
  /**
   * Marks this pane as the index/landing pane for the app whose `Apps.App`
   * `path` equals this value. Only meaningful for root-segment panes; lets the
   * bare app-root URL resolve to this pane instead of the global welcome.
   */
  appPath?: string;
  component: ComponentType;
  /** Declares the typed shape of caller-provided input data (runtime no-op, type-level only). */
  input?: TypeMarker<Input>;
  chrome?: PaneChromeConfig<ParentParams & InferParams<Path>> | false;
  /**
   * Default column width in pixels. Read by layout renderers (e.g. Miller
   * columns). The leaf column ignores this and flex-grows. Defaults to 400.
   */
  width?: number;
} & ResolveField<Path>;

function define<
  Path extends string = "",
  ParentParams = {},
  Input = Record<string, string>,
>(
  args: DefineArgs<Path, ParentParams, Input>,
): PaneObject<
  ParentParams & InferParams<Path>,
  InferParams<Path>,
  Input
> {
  const segment = (args.segment ?? "").replace(/^\/+/, "");

  if (segment && segment.startsWith(":")) {
    throw new Error(
      `Pane "${args.id}": segment "${segment}" starts with a bare :param. ` +
        `Add a static prefix (e.g. "x/${segment}") to avoid URL parsing ambiguity.`,
    );
  }

  const defaultAncestors: Array<{ id: string }> = (args.defaultAncestors ?? []).map(
    (p) => ({ id: p._internal.id }),
  );

  const actionsSlot = defineSlot<{
    component: ComponentType;
    position?: "left" | "right";
  }>(`pane.${args.id}.actions`);

  const resolve = "resolve" in args ? (args.resolve as PaneInternal["resolve"]) : undefined;

  const internal: PaneInternal = {
    id: args.id,
    defaultAncestors,
    segment,
    appPath: args.appPath,
    component: args.component,
    chrome: normalizeChrome(args.chrome),
    width: args.width,
    actionsSlot,
    resolve,
  };

  return makePaneObject(internal) as PaneObject<
    ParentParams & InferParams<Path>,
    InferParams<Path>,
    Input
  >;
}

export const Pane = { define, Register: PaneSlots.Register };

// ---------------------------------------------------------------------------
// Registry sync — populates the module-local `registry` from the
// `Pane.Register` slot. Called once from <MillerColumns/> at the start of
// every render, synchronously via useMemo so parseUrl() and the
// pane.close() event handlers always see fresh state.
// ---------------------------------------------------------------------------

export function useSyncPaneRegistry(): void {
  const store = usePaneStore();
  const contributions = PaneSlots.Register.useContributions();
  useMemo(() => {
    registry.clear();
    const seen = new Set<string>();
    for (const { pane } of contributions) {
      const internal = pane._internal;
      if (seen.has(internal.id)) {
        console.warn(`Pane "${internal.id}" registered twice.`);
        continue;
      }
      seen.add(internal.id);
      registry.set(internal.id, internal);
    }
    // Re-sync the route from the current URL now that the registry is
    // populated. On initial load the store's handleLocationChange() runs
    // (via the window listener) before any panes are registered, so the
    // route stays empty until this re-sync.
    store.handleLocationChange();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `store` identity is stable per surface; re-running on registry contribution change is what matters
  }, [contributions]);
}

// ---------------------------------------------------------------------------
// Memoized resolved-route match, consumed by every layout renderer.
// ---------------------------------------------------------------------------

export function useRoute(): PaneMatch | null {
  const store = usePaneStore();
  const route = useRouteSlots();
  return useMemo(() => store.resolveRoute(route), [store, route]);
}

// ---------------------------------------------------------------------------
// Index/landing pane resolution. Separate from the opened route: the route is
// purely URL-derived (empty at a bare app root), while the index pane is a
// main-area concern resolved here and rendered only by the main-area renderer
// (MillerColumns). Overlay hosts ignore it, so a bare root means "no overlay".
// ---------------------------------------------------------------------------

// Stable instanceId per index pane id, so the index pane keeps the same React
// key/identity across renders (no remount). Distinct from route slot ids.
const indexInstanceIds = new Map<string, number>();
function indexInstanceIdFor(paneId: string): number {
  let id = indexInstanceIds.get(paneId);
  if (id === undefined) {
    id = nextInstanceId++;
    indexInstanceIds.set(paneId, id);
  }
  return id;
}

/**
 * Resolve the index/landing pane for the given app basePath into a stable
 * single-entry match, or null when the app declares no `appPath`-scoped index.
 * Recomputes only when the basePath or the registered pane set changes, so the
 * returned match identity is stable and the index pane never remounts.
 */
export function useIndexMatch(basePath: string): PaneMatch | null {
  const contributions = PaneSlots.Register.useContributions();
  return useMemo(() => {
    const bp = normalizeAppPath(basePath);
    for (const pane of registry.values()) {
      if (pane.segment && pane.segment !== "/" && pane.segment !== "") continue;
      if (pane.appPath === undefined) continue;
      if (normalizeAppPath(pane.appPath) !== bp) continue;
      const entry: MatchEntry = {
        instanceId: indexInstanceIdFor(pane.id),
        uuid: `index:${pane.id}`,
        pane,
        params: {},
        fullParams: {},
        input: {},
      };
      return { panes: [entry] };
    }
    return null;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `contributions` identity tracks the registry; registry itself is a module-level mutable Map read inside.
  }, [basePath, contributions]);
}

/**
 * Shared renderer preamble. Every layout renderer (Miller columns, full-pane,
 * …) repeats the same sequence to turn the active app's basePath into a route
 * match: set the base path (synchronous side-effect), sync the registry, then
 * return the URL-derived route match or fall back to the index pane. Exposing
 * it here keeps renderers thin and stops them copy-pasting this hook order
 * (which must stay stable). Mirrors MillerColumns exactly.
 */
export function usePaneRoute(basePath: string): PaneMatch | null {
  const store = usePaneStore();
  useMemo(() => {
    store.setBasePath(basePath);
  }, [store, basePath]);
  useSyncPaneRegistry();
  const route = useRoute();
  const index = useIndexMatch(basePath);
  return route ?? index;
}

// ---------------------------------------------------------------------------
// openPane — imperative (non-hook) open. Targets the live store, matching the
// historical module-global behavior for the ~40 imperative call sites.
// The non-positional open logic itself lives on the store (`openPaneImpl`).
// ---------------------------------------------------------------------------

export type PaneOpenMode = "root" | "push" | "swap";

export function openPane(
  target: PaneObject<any, any, any>,
  params: Record<string, string>,
  opts: { mode: "root"; input?: Record<string, string> },
): void {
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- overload narrows mode to "root" but the check keeps this future-proof for additional modes
  liveStore.openPaneImpl(target._internal, params, { root: opts.mode === "root", input: opts.input });
}

// ---------------------------------------------------------------------------
// useOpenPane — caller-aware pane navigation hook. Operates on the *context*
// store (the surface it is rendered in).
// ---------------------------------------------------------------------------

export function useOpenPane(): (
  target: PaneObject<any, any, any>,
  params: Record<string, string>,
  opts: { mode: PaneOpenMode; side?: "left" | "right"; input?: Record<string, string> },
) => void {
  const store = usePaneStore();
  const callerInstanceId = useContext(PaneInstanceContext);

  return useCallback(
    (
      target: PaneObject<any, any, any>,
      params: Record<string, string>,
      opts: { mode: PaneOpenMode; side?: "left" | "right"; input?: Record<string, string> },
    ) => {
      const targetInternal = target._internal;
      const input = opts.input ?? {};

      if (opts.mode === "root" || callerInstanceId === undefined) {
        store.openPaneImpl(targetInternal, params, { root: opts.mode === "root", input });
        return;
      }

      const currentRoute = store.getRoute();
      const callerIndex = currentRoute.findIndex(
        (s) => s.instanceId === callerInstanceId,
      );
      if (callerIndex < 0) {
        store.openPaneImpl(targetInternal, params, { input });
        return;
      }

      const callerPaneId = currentRoute[callerIndex]!.paneId;
      const ownParams = extractOwnParams(targetInternal, params);
      const replace =
        targetInternal.chrome.enabled && !targetInternal.chrome.history;

      // swap: update the caller's slot in-place (same column), truncating
      // children. Used when internal navigation within a pane wants to swap
      // which entity is shown without growing the route (e.g. clicking a
      // dependency chip switches the task detail to a different task).
      if (opts.mode === "swap" && targetInternal.id === callerPaneId) {
        const existing = currentRoute[callerIndex]!;
        const sameParams =
          Object.keys(ownParams).length === Object.keys(existing.params).length &&
          Object.keys(ownParams).every((k) => ownParams[k] === existing.params[k]);
        const sameInput =
          Object.keys(input).length === Object.keys(existing.input).length &&
          Object.keys(input).every((k) => input[k] === existing.input[k]);
        if (sameParams && sameInput) return;
        const newRoute = currentRoute.slice(0, callerIndex + 1);
        newRoute[callerIndex] = createSlot(targetInternal.id, ownParams, input);
        store.setRoute(newRoute, replace);
        return;
      }

      if (opts.side === "left") {
        const alreadyAncestor = currentRoute
          .slice(0, callerIndex)
          .some((s) => s.paneId === targetInternal.id);
        if (!alreadyAncestor) {
          const newRoute = [
            ...currentRoute.slice(0, callerIndex),
            createSlot(targetInternal.id, ownParams, input),
            ...currentRoute.slice(callerIndex),
          ];
          store.setRoute(newRoute, replace);
          return;
        }
      }

      // push right (default): truncate after caller, append target
      const newRoute = [
        ...currentRoute.slice(0, callerIndex + 1),
        createSlot(targetInternal.id, ownParams, input),
      ];
      store.setRoute(newRoute, replace);
    },
    [store, callerInstanceId],
  );
}
