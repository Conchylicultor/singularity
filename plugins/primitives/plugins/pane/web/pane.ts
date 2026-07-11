import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useMemo,
  useSyncExternalStore,
  type ComponentType,
  type ReactNode,
} from "react";
import { defineSlot, getDeferredLoadState, type Slot } from "@plugins/framework/plugins/web-sdk/core";
import { SurfaceIdContext } from "@plugins/primitives/plugins/surface-id/web";
import { useLatestRef } from "@plugins/primitives/plugins/latest-ref/web";
import {
  fillSegment,
  normalizeSegmentPattern,
  type AppRef,
  type InferParams,
  type RouteDef,
} from "../core";
import { Pane as PaneSlots } from "./slots";
import { useRenderSync } from "./use-render-sync";
import type { PaneHeaderZones } from "./components/pane-header-item";

export type { PaneHeaderZones, PaneToolbarItem } from "./components/pane-header-item";

export type { InferParams } from "../core";

// ---------------------------------------------------------------------------
// Type machinery — extract `:param` and `:param*` names from a path template.
// `InferParams` itself lives in `../core` (the single definition, shared with
// the server); these raw helpers stay local because `HasParams` needs the
// pre-normalized extraction (see the note on `HasParams` below).
// ---------------------------------------------------------------------------

type ParamName<S extends string> = S extends `${infer N}*` ? N : S;

type ExtractParams<Path extends string> = Path extends `${infer Seg}/${infer Rest}`
  ? (Seg extends `:${infer P}` ? { [K in ParamName<P>]: string } : {}) &
      ExtractParams<Rest>
  : Path extends `:${infer P}`
    ? { [K in ParamName<P>]: string }
    : {};

// ---------------------------------------------------------------------------
// Resolve hook — mandatory for parameterized panes, opt-out with `false`.
// ---------------------------------------------------------------------------

export type ResolveHook<Params extends Record<string, string>> =
  (params: Params) => { pending: boolean; found: boolean };

// Tests the RAW extraction (`{}` for a paramless path → keyof never), NOT
// `InferParams`: the latter now normalizes the empty case to
// `Record<string, never>` whose `keyof` is `string | number`, which would
// misreport every paramless pane as paramful.
type HasParams<Path extends string> = keyof ExtractParams<Path> extends never ? false : true;

type ResolveField<Path extends string> =
  HasParams<Path> extends true
    ? { resolve: ResolveHook<InferParams<Path>> | false }
    : { resolve?: never };

let nextInstanceId = 0;

/**
 * Caller-provided, non-URL pane OPTIONS. Unlike `params` (which serialize into
 * the URL and so must be strings), options live in `history.state` and are
 * persisted via the structured-clone algorithm — booleans, numbers, and nested
 * objects round-trip faithfully. The storage type is therefore an arbitrary
 * structured-cloneable bag, NOT `Record<string, string>`.
 *
 * A slot stores only the PARTIAL the opener supplied; `useOptions()` merges it
 * under the pane's declared `options: {…}` defaults. So the deep-link value of
 * every option is stated once, at the pane definition, and changing a default
 * later applies to routes already sitting in `history.state`.
 */
export type PaneOptions = Record<string, unknown>;

/**
 * The erased runtime storage for a pane's optimistic {@link Hint}. In-memory
 * ONLY — deliberately absent from every serialized form (see `setRoute`).
 */
type PaneHintBag = Record<string, unknown>;

export interface PaneSlot {
  instanceId: number;
  uuid: string;
  paneId: string;
  params: Record<string, string>;
  /** The opener-supplied PARTIAL. Merged under the pane's defaults on read. */
  options: PaneOptions;
  /** Ephemeral. Never serialized; `{}` on every rebuilt route. */
  hint: PaneHintBag;
}

function createSlot(
  paneId: string,
  params: Record<string, string>,
  options: PaneOptions = {},
  hint: PaneHintBag = {},
  uuid?: string,
): PaneSlot {
  return {
    instanceId: nextInstanceId++,
    uuid: uuid ?? crypto.randomUUID(),
    paneId,
    params,
    options,
    hint,
  };
}

// ---------------------------------------------------------------------------
// `Hint<T>` — an optimistic mirror of server-owned state, supplied by whoever
// opened the pane so the surface can pre-paint before the canonical resource
// settles.
// ---------------------------------------------------------------------------

/**
 * A hint is NOT pane data. It is absent on any route the browser rebuilt (deep
 * link, reload, back/forward), and possibly stale when present. It must never
 * become a source of truth.
 *
 * Two properties make that structural rather than aspirational:
 *
 *  1. `Hint` carries **no enumerable data** — it is a closure. `pick` is the
 *     only accessor, and it REQUIRES the canonical value as an argument. You
 *     cannot obtain a hinted value "bare": you must already hold the truth to
 *     see the hint at all — and if you hold the truth, you have no reason to
 *     write the hint.
 *  2. The hint is ephemeral (never serialized), so it cannot outlive the
 *     navigation that created it.
 *
 * The residual `?? "<fabricated default>"` on `pick`'s `T[K] | undefined` result
 * is banned by the `pane/no-hint-fabrication` lint rule: a hint's fallback must
 * be `null`, `undefined`, or a ReactNode — never a value that could be written
 * back. See `research/2026-07-10-global-pane-input-hint-vs-options.md`.
 */
export interface Hint<T extends object> {
  /**
   * Read one hinted field. `canonical` is the authoritative value, or
   * `undefined` while it is still loading. Returns `canonical` when it is
   * defined (a canonical `null` wins — that is a real value), otherwise the
   * opener's optimistic hint, itself `undefined` on a rebuilt route.
   */
  pick<K extends keyof T>(key: K, canonical: T[K] | undefined): T[K] | undefined;
}

function makeHint(bag: PaneHintBag): Hint<Record<string, unknown>> {
  return {
    pick: (key, canonical) =>
      canonical !== undefined ? canonical : bag[key as string],
  };
}

const EMPTY_HINT: Hint<Record<string, unknown>> = makeHint({});

/**
 * The generic default for a pane that declares no `options` / no `hint`. Not
 * `{}` — TypeScript treats `{}` as "any non-nullish value", so an object literal
 * would sail through the excess-property check and a caller could pass options
 * to a pane that declares none (which is how a dead `input: { convId }` survived
 * on `attemptPane` for months). `Record<string, never>` rejects every key.
 */
type NoOptions = Record<string, never>;
type NoHint = Record<string, never>;

// ---------------------------------------------------------------------------
// `type<T>()` — a phantom marker used to declare the `hint` shape at the
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
  /**
   * Opt into a custom header. When set, `PaneChrome` renders these reorderable
   * `Start`/`End` render-slot zones INSIDE its standard `<Bar tier="pane">`
   * instead of the default `title` + Actions — with NO overflow-collapse, so
   * rich widgets (transport / volume / jog-wheel) never fold into a "⋯"
   * popover. Build the zones with `definePaneToolbar` (pane-toolbar). The
   * promote/close buttons still render after the End zone. When omitted,
   * `PaneChrome` keeps the default header layout.
   */
  header?: PaneHeaderZones;
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
  title?: string | ((params: Record<string, string>) => string);
  header?: PaneHeaderZones;
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
  /**
   * Self-contained title resolver for tab labels and the browser document
   * title. A React hook that runs OUTSIDE the owning app's providers (at the
   * tab-surface level), so it may read only params, the pane's `hint`/`options`,
   * and GLOBAL hooks (live-state resources) — never app-local context. Returns
   * undefined to fall back to `chrome.title`. Normalized to always-present (a
   * no-op default) so callers can invoke it unconditionally; see
   * {@link usePaneTitle}.
   *
   * `hint` and `options` arrive as VALUES, not hooks: this runs above the pane
   * match context, so `useHint()`/`useOptions()` are unavailable here.
   */
  useTitle: (
    params: Record<string, string>,
    hint: Hint<Record<string, unknown>>,
    options: PaneOptions,
  ) => string | undefined;
  /**
   * The literal defaults record from `Pane.define({ options })`. Merged under
   * each slot's opener-supplied partial to produce a TOTAL option set — so a
   * pane's deep-link behavior is declared once, here, and never re-invented at a
   * read site with a `??`.
   */
  optionDefaults: PaneOptions;
}

// Populated synchronously via useSyncPaneRegistry (called by MillerColumns).
// pane.close / pane.expand / parseUrl read from it; nobody writes to it
// outside the sync hook.
const registry = new Map<string, PaneInternal>();

// Reverse map from a pane's internal record back to its public PaneObject.
// Populated by makePaneObject at define time. Lets callers that only hold a
// PaneInternal (e.g. the resolve guard, which receives MatchEntry.pane) reach
// the object's hooks (useClose/usePromote) to reuse the standard chrome.
const paneObjectByInternal = new WeakMap<PaneInternal, AnyPane>();

/** Resolve the public PaneObject for an internal pane record. */
export function paneObjectFor(internal: PaneInternal): AnyPane {
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
  /** The pane's declared option defaults, merged under the opener's partial. Total. */
  options: PaneOptions;
  /** Ephemeral optimistic hint bag. `{}` on any rebuilt route. See {@link Hint}. */
  hint: PaneHintBag;
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

/**
 * The result of parsing a (base-path-stripped) URL pathname into a route. A
 * discriminated union so callers can tell a genuine match — including the empty
 * bare-root route — from a URL that matched no registered pane. Distinguishing
 * the two is the whole point of the tri-state route: `matched []` is a bare app
 * root, while `unresolved` is a load-gap (the target pane's plugin may still be
 * loading in the deferred tier) or a genuinely dead link.
 */
export type ParsedRoute =
  | { status: "matched"; slots: PaneSlot[] } // slots [] ⇒ bare app root (explicit)
  | { status: "unresolved"; rawPath: string }; // a segment matched no registered pane

export function parseUrl(pathname: string): ParsedRoute {
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

    // A segment matched no registered pane: the URL is not resolvable at this
    // moment. `rawPath` is the normalized (slash-trimmed) app-relative path so a
    // consumer can seed a pending route (deferred plugin still loading) or, once
    // loading has settled, surface a not-found. Kept distinct from `matched []`.
    if (!bestMatch) return { status: "unresolved", rawPath: normalized };

    route.push(createSlot(bestMatch.pane.id, bestMatch.params));
    cursor += bestMatch.consumed;
  }

  // A bare app root (basePath-stripped pathname is "/") yields an EMPTY MATCHED
  // route — explicitly a match, not an unresolved URL. The index/landing pane is
  // NOT injected here: it is a main-area-renderer concern, resolved by
  // `useIndexMatch` (see below) and rendered only by MillerColumns. Keeping it
  // out of the route store means an overlay host (e.g. Sonata's PaneOverlayHost)
  // sees "nothing opened" at a bare root and renders no overlay, instead of
  // inheriting another app's index pane.
  return { status: "matched", slots: route };
}

export function buildRouteUrl(route: PaneSlot[]): string {
  if (route.length === 0) return "/";

  const parts: string[] = [];
  for (const slot of route) {
    const pane = registry.get(slot.paneId);
    if (!pane) throw new Error(`Unknown pane: ${slot.paneId}`);
    // `fillSegment` owns the `:name`/`:name*`/encode/missing-param logic — the
    // single source of truth shared with `RouteDef.path`.
    parts.push(...fillSegment(pane.segment, slot.params));
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

/**
 * The store-internal route state. Two states — the public tri-state
 * (pending / not-found) is folded at read time from the deferred-load signal, so
 * it is never persisted here (it flips on load progress).
 *
 * - `resolved` — the route is `slots` (possibly `[]` for the bare app root).
 * - `unresolved` — the URL matched no registered pane; `rawPath` is the
 *   normalized app-relative path to seed a pending route or surface a not-found.
 */
export type RouteState =
  | { kind: "resolved"; slots: PaneSlot[] }
  | { kind: "unresolved"; rawPath: string };

// Stable module-const empties so snapshot identity never churns between
// mutations: `getRoute()` returns this exact array for any unresolved state, and
// the server / initial snapshot of `useRouteState()` is this exact object.
const EMPTY: PaneSlot[] = [];
const RESOLVED_EMPTY: RouteState = { kind: "resolved", slots: EMPTY };

export interface PaneStore {
  /** Current in-memory route slots (`[]` for a bare root OR an unresolved URL). */
  getRoute(): PaneSlot[];
  /** Snapshot for `useSyncExternalStore` (identity-stable until mutation). */
  getRouteSnapshot(): PaneSlot[];
  /** Current tri-state route state (resolved slots vs unresolved rawPath). */
  getRouteState(): RouteState;
  /** Snapshot for `useSyncExternalStore` (identity-stable until mutation). */
  getRouteStateSnapshot(): RouteState;
  /** Subscribe to route changes; returns an unsubscribe. */
  subscribeRoute(cb: () => void): () => void;
  /** Replace the route (resolved). Mirrors to the browser when `live`. */
  setRoute(route: PaneSlot[], replace?: boolean): void;
  /**
   * Seed an unresolved (pending) route from a raw app-relative path — NO
   * url/history side-effects. Used at boot and for background tabs, where the URL
   * is owned elsewhere (the address bar / the focused tab).
   */
  seedPending(rawPath: string): void;
  /**
   * Live navigation to a not-yet-resolvable URL: set unresolved AND write
   * `history.state = { pending: rawPath }` + the URL, dispatching
   * `popstate`/`shell:navigate` like `setRoute`. Pushes a new history entry by
   * default; pass `replace` to mirror the URL in place (no stray entry — used by
   * the tab activate() to assert a freshly-focused pending tab's URL). No-ops the
   * history part when the store is not `live`.
   */
  navigatePending(rawPath: string, replace?: boolean): void;
  /** Re-derive the route from a (base-path-stripped) URL pathname. */
  syncRouteFromUrl(pathname: string): void;
  /** popstate/shell:navigate handler — restore from history.state or URL. */
  handleLocationChange(): void;
  reorderRoute(fromIndex: number, toIndex: number): void;
  restoreRoute(
    slots: Array<{ paneId: string; params: Record<string, string>; options?: PaneOptions }>,
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
    opts?: { root?: boolean; options?: PaneOptions; hint?: PaneHintBag },
  ): void;
  close(internal: PaneInternal, instanceId: number): void;
  unwrap(instanceId: number): void;
  promote(internal: PaneInternal, instanceId: number): void;
  /** Whether route mutations mirror to the browser URL/history. */
  live: boolean;
}

function createPaneStore(opts: { live: boolean } = { live: false }): PaneStore {
  let currentState: RouteState = RESOLVED_EMPTY;
  const routeListeners = new Set<() => void>();
  let currentBasePath = "";
  let prevResolvedByUuid = new Map<string, MatchEntry>();

  // The slots the rest of the store reads/mutates. An unresolved route has no
  // slots — it presents as the stable module-const EMPTY, so the slot-reading
  // mutators (open/close/reorder/…) behave exactly as they did when an
  // unresolved URL yielded `[]`.
  function currentSlots(): PaneSlot[] {
    return currentState.kind === "resolved" ? currentState.slots : EMPTY;
  }

  function notifyRouteListeners(): void {
    for (const fn of routeListeners) fn();
  }

  function applyBasePath(rawUrl: string): string {
    if (!currentBasePath) return rawUrl;
    if (rawUrl === "/") return currentBasePath;
    return currentBasePath + rawUrl;
  }

  function setRoute(route: PaneSlot[], replace = false): void {
    currentState = { kind: "resolved", slots: route };
    notifyRouteListeners();
    // Background stores update in-memory route + notify their own listeners
    // only; they never touch the browser URL/history.
    if (!store.live) return;
    const url = buildRouteUrl(route);
    // `hint` is deliberately NOT serialized: an optimistic mirror of server-owned
    // state must not outlive the navigation that created it, or it comes back as
    // stale data on the very paths (reload, back/forward) that have no opener to
    // vouch for it. Rebuilt routes carry `hint = {}` and read canonical instead.
    const serialized = route.map(s => ({ paneId: s.paneId, params: s.params, options: s.options, uuid: s.uuid }));
    const fullUrl = applyBasePath(url);
    if (fullUrl === window.location.pathname && replace) return;
    const method = replace ? "replaceState" : "pushState";
    window.history[method]({ route: serialized }, "", fullUrl);
    window.dispatchEvent(new PopStateEvent("popstate"));
    window.dispatchEvent(new CustomEvent("shell:navigate"));
  }

  function reorderRoute(fromIndex: number, toIndex: number): void {
    if (typeof window === "undefined") return;
    const route = [...currentSlots()];
    if (fromIndex < 0 || fromIndex >= route.length) return;
    if (toIndex < 0 || toIndex >= route.length) return;
    if (fromIndex === toIndex) return;
    const [item] = route.splice(fromIndex, 1);
    route.splice(toIndex, 0, item!);
    setRoute(route);
  }

  function restoreRoute(
    slots: Array<{ paneId: string; params: Record<string, string>; options?: PaneOptions }>,
  ): void {
    if (typeof window === "undefined") return;
    const route: PaneSlot[] = slots.map((s) => createSlot(s.paneId, s.params, s.options ?? {}));
    if (route.length === 0) return;
    setRoute(route);
  }

  function clearRoute(): void {
    if (typeof window === "undefined") return;
    setRoute([]);
  }

  function seedPending(rawPath: string): void {
    currentState = { kind: "unresolved", rawPath };
    notifyRouteListeners();
  }

  function navigatePending(rawPath: string, replace = false): void {
    currentState = { kind: "unresolved", rawPath };
    notifyRouteListeners();
    if (!store.live) return;
    const fullUrl = applyBasePath("/" + rawPath);
    const method = replace ? "replaceState" : "pushState";
    window.history[method]({ pending: rawPath }, "", fullUrl);
    window.dispatchEvent(new PopStateEvent("popstate"));
    window.dispatchEvent(new CustomEvent("shell:navigate"));
  }

  function syncRouteFromUrl(pathname: string): void {
    const parsed = parseUrl(pathname);
    if (parsed.status === "matched") {
      // A matched parse always wins (equality-guarded, as today) — the URL now
      // resolves to concrete panes.
      if (currentState.kind === "resolved" && routesEqual(currentState.slots, parsed.slots)) {
        return;
      }
      currentState = { kind: "resolved", slots: parsed.slots };
      notifyRouteListeners();
      return;
    }

    // Unresolved: the URL matched no registered pane. THE NO-CLOBBER RULE (the
    // linchpin of the tri-state route): a pre-registry parse during cold boot
    // must NOT wipe a route that was restored from persistence / prior
    // navigation — that is exactly the historical cold-boot clobber. So adopt the
    // unresolved state ONLY when the current state is not a resolved non-empty
    // route, OR loading has settled. After settle a genuinely dead link must
    // become visible (NotFound / error) instead of leaving a stale pane on
    // screen. (Within a session this path is nearly unreachable: address-bar
    // edits are full reloads and back/forward restores from `history.state`, so
    // this is really boot protection.)
    if (currentState.kind === "unresolved") {
      if (currentState.rawPath === parsed.rawPath) return;
      currentState = { kind: "unresolved", rawPath: parsed.rawPath };
      notifyRouteListeners();
      return;
    }
    const settled = getDeferredLoadState().deferredComplete;
    if (currentState.slots.length > 0 && !settled) return;
    currentState = { kind: "unresolved", rawPath: parsed.rawPath };
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
          options: { ...pane.optionDefaults, ...slot.options },
          hint: slot.hint,
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
    const state = window.history.state as {
      route?: Array<{ paneId: string; params: Record<string, string>; options?: PaneOptions; uuid?: string }>;
      pending?: string;
    } | null;
    if (state?.route) {
      // No `hint`: history.state never carries one (see `setRoute`). `routesEqual`
      // compares options only, so the synthetic popstate `setRoute` dispatches
      // right after a hint-carrying open bails out here and leaves the in-memory
      // hint intact — only a genuine back/forward rebuilds the slot without it.
      const newRoute = state.route.map(s => createSlot(s.paneId, s.params, s.options ?? {}, {}, s.uuid));
      if (currentState.kind === "resolved" && routesEqual(currentState.slots, newRoute)) return;
      currentState = { kind: "resolved", slots: newRoute };
      notifyRouteListeners();
    } else if (typeof state?.pending === "string") {
      // A pending (unresolved) route round-trips through back/forward via
      // `history.state.pending` — restore it without re-parsing the URL, just as
      // the `state.route` branch restores a resolved route.
      if (currentState.kind === "unresolved" && currentState.rawPath === state.pending) return;
      currentState = { kind: "unresolved", rawPath: state.pending };
      notifyRouteListeners();
    } else {
      const pathname = stripBasePath(window.location.pathname, currentBasePath);
      syncRouteFromUrl(pathname);
    }
  }

  function openPaneImpl(
    internal: PaneInternal,
    params: Record<string, string>,
    implOpts?: { root?: boolean; options?: PaneOptions; hint?: PaneHintBag },
  ): void {
    const replace = !internal.chrome.history;
    const route = currentSlots();
    const ownParams = extractOwnParams(internal, params);
    const options = implOpts?.options ?? {};
    const hint = implOpts?.hint ?? {};

    if (!implOpts?.root) {
      const existingIdx = route.findIndex((s) => s.paneId === internal.id);
      if (existingIdx >= 0) {
        const existing = route[existingIdx]!;
        const sameParams =
          Object.keys(ownParams).length === Object.keys(existing.params).length &&
          Object.keys(ownParams).every((k) => ownParams[k] === existing.params[k]);
        // Identity is (paneId, params, options). A hint is not identity: two
        // opens that differ only by their optimistic hint must dedupe to the
        // same slot, or the pane remounts (or stacks) for a display-only value.
        if (sameParams && sameOptions(options, existing.options)) return;
        const newRoute = route.slice(0, existingIdx + 1);
        newRoute[existingIdx] = createSlot(internal.id, ownParams, options, hint);
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
    setRoute([...ancestorSlots, createSlot(internal.id, ownParams, options, hint)], replace);
  }

  function close(internal: PaneInternal, instanceId: number): void {
    if (typeof window === "undefined") return;
    const route = currentSlots();
    const idx = route.findIndex((s) => s.instanceId === instanceId);
    if (idx <= 0) return;
    const newRoute = route.slice(0, idx);
    const replace = !internal.chrome.history;
    setRoute(newRoute, replace);
  }

  function unwrap(instanceId: number): void {
    if (typeof window === "undefined") return;
    const route = currentSlots();
    const idx = route.findIndex((s) => s.instanceId === instanceId);
    if (idx < 0) return;
    const newRoute = [...route.slice(0, idx), ...route.slice(idx + 1)];
    setRoute(newRoute);
  }

  function promote(internal: PaneInternal, instanceId: number): void {
    if (typeof window === "undefined") return;
    const route = currentSlots();
    const idx = route.findIndex((s) => s.instanceId === instanceId);
    if (idx < 0) return;
    const fullParams: Record<string, string> = {};
    for (let i = 0; i <= idx; i++) {
      Object.assign(fullParams, route[i]!.params);
    }
    // Options carry forward (they are the pane's configuration); the hint does
    // not — promoting is a navigation, and the promoted pane re-reads canonical.
    openPaneImpl(internal, fullParams, { root: true, options: route[idx]!.options });
  }

  const store: PaneStore = {
    getRoute: () => currentSlots(),
    getRouteSnapshot: () => currentSlots(),
    getRouteState: () => currentState,
    getRouteStateSnapshot: () => currentState,
    subscribeRoute: (cb) => {
      routeListeners.add(cb);
      return () => routeListeners.delete(cb);
    },
    setRoute,
    seedPending,
    navigatePending,
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

// ---------------------------------------------------------------------------
// Surface app context. Carries the owning `appId` of the surface (tab/window)
// so consumers can read "which app owns the surface I'm rendered in" without
// touching `window.location` — the focused-URL read is wrong the moment a
// second surface is visible. `undefined` outside any `PaneSurfaceProvider`, so
// `useActiveApp`/`useCurrentAppId` fall back to the URL-derived focused app.
// ---------------------------------------------------------------------------

export const PaneSurfaceAppContext = createContext<string | undefined>(undefined);

export function useSurfaceAppId(): string | undefined {
  return useContext(PaneSurfaceAppContext);
}

// ---------------------------------------------------------------------------
// Load-scope context. The fs plugin-path prefix (e.g. "apps/plugins/pages/") of
// the app owning this surface, so a fallback surface can ask "did a plugin under
// THIS app's subtree fail to load" (`useHasLoadErrorUnder`) and show an app-load
// error instead of a blank/not-found. Empty string ("") outside any surface that
// provides it — `hasLoadErrorUnder("")` is always false, never a global flag.
// ---------------------------------------------------------------------------

export const PaneLoadScopeContext = createContext<string>("");

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
  appId,
  surfaceId,
  loadScopePrefix,
  children,
}: {
  store: PaneStore;
  basePath: string;
  /** Owning app of this surface; read via {@link useSurfaceAppId}. */
  appId?: string;
  /** Stable per-surface-instance id (the tab's `tabId`); read via `useSurfaceTabId`
   *  from `@plugins/primitives/plugins/surface-id/web`. */
  surfaceId?: string;
  /**
   * Fs plugin-path prefix of the app owning this surface (e.g.
   * "apps/plugins/pages/"); provided via {@link PaneLoadScopeContext} so the
   * fallback surface can scope a load-error check to this app. Omit for surfaces
   * with no app subtree (defaults to "").
   */
  loadScopePrefix?: string;
  children: ReactNode;
}): ReactNode {
  return createElement(
    PaneStoreContext.Provider,
    { value: store },
    createElement(
      PaneBasePathContext.Provider,
      { value: basePath },
      createElement(
        PaneSurfaceAppContext.Provider,
        { value: appId },
        createElement(
          PaneLoadScopeContext.Provider,
          { value: loadScopePrefix ?? "" },
          createElement(SurfaceIdContext.Provider, { value: surfaceId }, children),
        ),
      ),
    ),
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
  slots: Array<{ paneId: string; params: Record<string, string>; options?: PaneOptions }>,
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

/**
 * The context surface's tri-state route state (resolved slots vs unresolved
 * rawPath), reactive over the same store subscription as {@link useRoute}. The
 * server / initial snapshot is the module-const resolved-empty. Consumers fold
 * the public pending / not-found distinction from this plus the deferred-load
 * signal (see {@link usePaneRoute} and the layout's fallback surface).
 */
export function useRouteState(): RouteState {
  const store = usePaneStore();
  return useSyncExternalStore(
    store.subscribeRoute,
    store.getRouteStateSnapshot,
    () => RESOLVED_EMPTY,
  );
}

/** Shallow equality over two opener-supplied option partials. */
function sameOptions(a: PaneOptions, b: PaneOptions): boolean {
  const ak = Object.keys(a);
  if (ak.length !== Object.keys(b).length) return false;
  return ak.every((k) => a[k] === b[k]);
}

/**
 * Slot identity for the popstate bail-out: `(paneId, params, options)`.
 *
 * `hint` is excluded, and that is load-bearing. `setRoute` writes a hint-less
 * `history.state` and then dispatches a synthetic `popstate`; if the hint counted
 * here, `handleLocationChange` would rebuild the route from that hint-less state
 * and wipe the very hint the open just painted with.
 */
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
    if (!sameOptions(a[i]!.options, b[i]!.options)) return false;
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
export interface PaneToggleOpts<
  Options extends object = NoOptions,
  HintT extends object = NoHint,
> {
  action?: "close" | "unwrap";
  side?: "left" | "right";
  mode?: PaneOpenMode;
  /** Opener-supplied subset of the pane's declared `options` defaults. */
  options?: Partial<Options>;
  /** Optimistic display mirror. Ephemeral — see {@link Hint}. */
  hint?: HintT;
}

export interface PaneRouteEntry<OwnParams = Record<string, string>> {
  instanceId: number;
  uuid: string;
  params: OwnParams;
  fullParams: Record<string, string>;
  /** The pane's option defaults merged under the opener's partial. Total. */
  options: PaneOptions;
}

export interface PaneObject<
  FullParams = {},
  OwnParams = FullParams,
  Options extends object = NoOptions,
  HintT extends object = NoHint,
> {
  id: string;
  useParams(): OwnParams;
  /**
   * Read this pane's options: the opener-supplied partial merged under the
   * defaults declared in `Pane.define({ options })`. TOTAL — never `Partial`.
   * A rebuilt route (deep link, reload) simply yields the defaults, so the
   * deep-link value lives at the pane definition and no read site needs a `??`.
   */
  useOptions(): Options;
  /**
   * Read this pane's optimistic {@link Hint} — an opener-supplied mirror of
   * server-owned state, absent on any rebuilt route. The returned object holds
   * no data: `pick(key, canonical)` is the only accessor, and it requires the
   * canonical value, so a hint can never be observed apart from its source of
   * truth and can never become one.
   */
  useHint(): Hint<HintT>;
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
    opts?: PaneToggleOpts<Options, HintT>,
  ): { isOpen: boolean; toggle: () => void };
  back(): void;
  forward(): void;
  /**
   * Build a full app-rooted link to this pane (e.g. "/agents/build/r/<id>").
   * Present ONLY on route-backed panes (defined via `Pane.define({ route })`);
   * `undefined` on legacy segment-form panes, which have no `RouteDef` to
   * resolve the app-relative path from. Delegates to {@link RouteDef.link}.
   */
  link?: (app: AppRef, params: FullParams) => string;
  Actions: Slot<{ component: ComponentType; position?: "left" | "right" }>;
  /** Internal. Consumers should not rely on this. */
  _internal: PaneInternal;
}

/**
 * "Some pane, whichever" — the type for positions that hold a pane without
 * caring about its params / options / hint (the `Pane.Register` slot, chrome
 * props, layout hosts). Spelled once so that adding a generic to `PaneObject`
 * never silently narrows a consumer through the strict `NoOptions`/`NoHint`
 * defaults.
 */
export type AnyPane = PaneObject<any, any, any, any>;

function makePaneObject(
  internal: PaneInternal,
  route?: RouteDef<any>,
): AnyPane {
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

  /** This pane's own MatchEntry, or null when it is not in the current match. */
  function useOwnEntry(): MatchEntry | null {
    const match = useContext(PaneMatchContext);
    const instanceId = useContext(PaneInstanceContext);
    if (!match) return null;
    if (instanceId !== undefined) {
      const entry = match.panes.find((e) => e.instanceId === instanceId);
      if (entry?.pane === internal) return entry;
    }
    return match.panes.find((e) => e.pane === internal) ?? null;
  }

  function useOptions(): PaneOptions {
    const entry = useOwnEntry();
    // Outside the match (a pane rendered off-route), the defaults ARE the answer
    // — the same total set a deep link would produce.
    return entry?.options ?? internal.optionDefaults;
  }

  function useHint(): Hint<Record<string, unknown>> {
    const bag = useOwnEntry()?.hint;
    return useMemo(() => (bag ? makeHint(bag) : EMPTY_HINT), [bag]);
  }

  function useRouteEntry(): PaneRouteEntry | null {
    const match = useContext(PaneMatchContext);
    if (!match) return null;
    const entry = match.panes.find((e) => e.pane === internal);
    if (!entry) return null;
    return { instanceId: entry.instanceId, uuid: entry.uuid, params: entry.params, fullParams: entry.fullParams, options: entry.options };
  }

  function useRouteEntries(): PaneRouteEntry[] {
    const match = useContext(PaneMatchContext);
    if (!match) return [];
    return match.panes
      .filter((e) => e.pane === internal)
      .map((e) => ({ instanceId: e.instanceId, uuid: e.uuid, params: e.params, fullParams: e.fullParams, options: e.options }));
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
    opts?: PaneToggleOpts<PaneOptions, PaneHintBag>,
  ): { isOpen: boolean; toggle: () => void } {
    const store = usePaneStore();
    const callerInstanceId = useContext(PaneInstanceContext);
    const route = useRouteSlots();
    const openPaneFn = useOpenPane();
    const paramsRef = useLatestRef(params);

    const action = opts?.action ?? "close";
    const mode = opts?.mode ?? "push";
    const side = opts?.side;
    const optionsRef = useLatestRef(opts?.options);
    const hintRef = useLatestRef(opts?.hint);

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
        openPaneFn(paneObject, paramsRef.current, {
          mode,
          side,
          options: optionsRef.current,
          hint: hintRef.current,
        });
      }
    }, [store, targetSlot, action, openPaneFn, mode, side]);

    return { isOpen, toggle };
  }

  const paneObject: AnyPane = {
    id: internal.id,
    useParams,
    useOptions,
    useHint,
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
    // Route-backed panes can resolve a full app-rooted link; legacy panes
    // leave this undefined (no RouteDef to derive the app-relative path).
    link: route ? (app, params) => route.link(app, params) : undefined,
    Actions: actionsSlot,
    _internal: internal,
  };
  paneObjectByInternal.set(internal, paneObject);
  return paneObject;
}

function normalizeChrome<Params>(
  chrome: PaneChromeConfig<Params> | undefined,
): NormalizedChrome {
  return {
    title: chrome?.title as NormalizedChrome["title"],
    header: chrome?.header,
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
type DefineArgs<
  Path extends string,
  ParentParams,
  Options extends object,
  HintT extends object,
> = {
  id: string;
  /** Optional default ancestors to prepend when opening this pane from scratch (no caller context). */
  defaultAncestors?: Array<AnyPane>;
  /** Own URL segment (no leading slash). */
  segment?: Path;
  /**
   * Marks this pane as the index/landing pane for the app whose `Apps.App`
   * `path` equals this value. Only meaningful for root-segment panes; lets the
   * bare app-root URL resolve to this pane instead of the global welcome.
   */
  appPath?: string;
  component: ComponentType;
  /**
   * Literal DEFAULTS for this pane's opener-supplied UI options. Read via
   * `useOptions()`, which merges the opener's partial over these — so the value
   * a deep link sees is declared here, once, and never re-invented at a read
   * site. Options have no canonical owner: absence genuinely means "the default".
   *
   * If a key's default would be a LIE about server-owned state
   * (`{ title: "Untitled" }`), it is a {@link hint}, not an option.
   */
  options?: Options;
  /**
   * Declares the typed shape of this pane's optimistic {@link Hint} — a mirror
   * of server-owned state, supplied by the opener to pre-paint before the
   * canonical resource settles (runtime no-op, type-level only). Absent on any
   * rebuilt route; never a write source.
   */
  hint?: TypeMarker<HintT>;
  chrome?: PaneChromeConfig<ParentParams & InferParams<Path>>;
  /**
   * Self-contained title resolver for tab labels and the browser document
   * title (see {@link PaneInternal.useTitle}). A React hook: it may call global
   * live-state hooks but must NOT depend on the owning app's context — it runs
   * at the tab surface, above the app's component tree. Read data the pane
   * already self-fetches (a global resource keyed by `params`), falling back to
   * the optimistic `hint` while it loads. Falls back to `chrome.title` when it
   * returns undefined.
   */
  useTitle?: (
    params: ParentParams & InferParams<Path>,
    hint: Hint<HintT>,
    options: Options,
  ) => string | undefined;
  /**
   * Default column width in pixels. Read by layout renderers (e.g. Miller
   * columns). The leaf column ignores this and flex-grows. Defaults to 400.
   */
  width?: number;
} & ResolveField<Path>;

// Route-form `resolve` field. A paramful route requires a resolve hook (or an
// explicit `false` opt-out); a paramless route forbids it. Mirrors
// `ResolveField<Path>` but keys off the route's resolved `Params` rather than a
// raw path template.
type RouteResolveField<Params extends Record<string, string>> =
  keyof Params extends never
    ? { resolve?: never }
    : { resolve: ResolveHook<Params> | false };

// Route form of `Pane.define`: identity (`id` / `segment` / `defaultAncestors`)
// is derived from the `RouteDef`, so the only authored fields are the behavior
// (`component`, `chrome`, `useTitle`, `input`, `width`, `resolve`). Params flow
// from `RouteDef<Params>`, so `useParams()` returns the full flat `Params`.
type RouteDefineArgs<
  Params extends Record<string, string>,
  Options extends object,
  HintT extends object,
> = {
  route: RouteDef<Params>;
  /**
   * Marks this pane as the index/landing pane for the app whose `Apps.App`
   * `path` equals this value. Only meaningful for root-segment panes.
   */
  appPath?: string;
  component: ComponentType;
  /** Literal defaults for the pane's opener-supplied UI options. See {@link DefineArgs.options}. */
  options?: Options;
  /** Typed shape of the pane's optimistic {@link Hint}. See {@link DefineArgs.hint}. */
  hint?: TypeMarker<HintT>;
  chrome?: PaneChromeConfig<Params>;
  useTitle?: (
    params: Params,
    hint: Hint<HintT>,
    options: Options,
  ) => string | undefined;
  /** Default column width in pixels. Read by layout renderers (e.g. Miller). */
  width?: number;
} & RouteResolveField<Params>;

// A route-backed pane always carries a (non-optional) `.link`.
type RoutePaneObject<
  Params extends Record<string, string>,
  Options extends object,
  HintT extends object,
> = PaneObject<Params, Params, Options, HintT> & {
  link: (app: AppRef, params: Params) => string;
};

// Route form — derive id/segment/defaultAncestors from the RouteDef.
function define<
  Params extends Record<string, string>,
  Options extends object = NoOptions,
  HintT extends object = NoHint,
>(
  args: RouteDefineArgs<Params, Options, HintT>,
): RoutePaneObject<Params, Options, HintT>;
// Legacy segment form — kept byte-for-byte for every unconverted pane.
function define<
  Path extends string = "",
  ParentParams = {},
  Options extends object = NoOptions,
  HintT extends object = NoHint,
>(
  args: DefineArgs<Path, ParentParams, Options, HintT>,
): PaneObject<
  ParentParams & InferParams<Path>,
  InferParams<Path>,
  Options,
  HintT
>;
function define(
  args:
    | RouteDefineArgs<Record<string, string>, PaneOptions, PaneHintBag>
    | DefineArgs<string, unknown, PaneOptions, PaneHintBag>,
): AnyPane {
  // Discriminate the two arg shapes on `route`: the route form derives
  // id/segment/defaultAncestors from the RouteDef; the legacy form reads them
  // directly. Narrowing on `args` (not a derived const) lets TS see which
  // fields exist in each branch.
  let route: RouteDef<any> | undefined;
  let id: string;
  let segment: string;
  let defaultAncestors: Array<{ id: string }>;
  if ("route" in args) {
    route = args.route;
    id = args.route.id;
    segment = args.route.segment;
    defaultAncestors = args.route.parentPaneIds.map((pid) => ({ id: pid }));
  } else {
    route = undefined;
    id = args.id;
    segment = args.segment ?? "";
    defaultAncestors = (args.defaultAncestors ?? []).map((p) => ({
      id: p._internal.id,
    }));
  }
  segment = segment.replace(/^\/+/, "");

  if (segment && segment.startsWith(":")) {
    throw new Error(
      `Pane "${id}": segment "${segment}" starts with a bare :param. ` +
        `Add a static prefix (e.g. "x/${segment}") to avoid URL parsing ambiguity.`,
    );
  }

  const actionsSlot = defineSlot<{
    component: ComponentType;
    position?: "left" | "right";
  }>(`pane.${id}.actions`);

  const resolve = "resolve" in args ? (args.resolve as PaneInternal["resolve"]) : undefined;

  const internal: PaneInternal = {
    id,
    defaultAncestors,
    segment,
    appPath: args.appPath,
    component: args.component,
    chrome: normalizeChrome(args.chrome as PaneChromeConfig<unknown> | undefined),
    width: args.width,
    actionsSlot,
    resolve,
    useTitle:
      (args.useTitle as PaneInternal["useTitle"] | undefined) ??
      (() => undefined),
    optionDefaults: args.options ?? {},
  };

  return makePaneObject(internal, route);
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
  useRenderSync(() => {
    registry.clear();
    const seen = new Set<string>();
    // Maps a normalized segment pattern → the paneId that first claimed it, so a
    // second pane whose segment matches the same URLs is caught immediately.
    const patternOwner = new Map<string, string>();
    for (const { pane } of contributions) {
      const internal = pane._internal;
      if (seen.has(internal.id)) {
        console.warn(`Pane "${internal.id}" registered twice.`);
        continue;
      }
      // Index/empty-segment panes resolve via `appPath`, not URL matching, so
      // multiple empty segments are legal — only check real URL segments.
      if (internal.segment && internal.segment !== "/" && internal.segment !== "") {
        const pattern = normalizeSegmentPattern(internal.segment);
        const owner = patternOwner.get(pattern);
        if (owner) {
          throw new Error(
            `Pane segment collision: "${owner}" and "${internal.id}" both match the same URLs ` +
              `("${registry.get(owner)!.segment}" vs "${internal.segment}"). Segments must be ` +
              `globally unique across all registered panes — rename one to disambiguate.`,
          );
        }
        patternOwner.set(pattern, internal.id);
      }
      seen.add(internal.id);
      registry.set(internal.id, internal);
    }
    // Re-sync the route from the current URL now that the registry is
    // populated. On initial load the store's handleLocationChange() runs
    // (via the window listener) before any panes are registered, so the
    // route stays empty until this re-sync.
    store.handleLocationChange();
  }, [contributions]);
}

// ---------------------------------------------------------------------------
// Memoized resolved-route match, consumed by every layout renderer.
// ---------------------------------------------------------------------------

export function useRoute(): PaneMatch | null {
  const store = usePaneStore();
  const route = useRouteSlots();
  // `resolveRoute` is a pure function of BOTH the route slots AND the pane
  // registry, so the memo must invalidate when either changes. Tracking only
  // `route` leaves a resolved route whose panes register in a LATER deferred
  // batch stuck as null: the registry fills, but `syncRouteFromUrl` short-circuits
  // on `routesEqual` (same slots) so the route array identity never changes and
  // the memo never re-runs. Depending on the `Pane.Register` contributions
  // identity (which tracks the registry, same as `useIndexMatch`) re-resolves the
  // instant the target pane's plugin loads — e.g. an instant-restored deep link.
  const contributions = PaneSlots.Register.useContributions();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `contributions` identity tracks the module-level registry Map read inside resolveRoute; it is the registry-version signal, not an unused dep.
  return useMemo(() => store.resolveRoute(route), [store, route, contributions]);
}

/**
 * Resolve a pane's human-readable title for tab labels and the browser document
 * title. Calls the pane's self-contained {@link PaneInternal.useTitle} hook
 * (data-backed: a conversation tab shows the conversation name, not its id);
 * when that yields nothing, falls back to the static `chrome.title`.
 *
 * Because `useTitle` is a hook that varies per pane, callers MUST invoke this
 * from a component keyed by the pane's id, so switching panes remounts and the
 * hook order stays stable across the component's life.
 */
export function usePaneTitle(
  pane: PaneInternal,
  params: Record<string, string>,
  hint: PaneHintBag,
  options: PaneOptions,
): string | undefined {
  const hintApi = useMemo(() => makeHint(hint), [hint]);
  const dynamic = pane.useTitle(params, hintApi, options);
  if (dynamic) return dynamic;
  const fallback = pane.chrome.title;
  return typeof fallback === "function" ? fallback(params) : fallback;
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
        options: { ...pane.optionDefaults },
        hint: {},
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
  useRenderSync(() => {
    store.setBasePath(basePath);
  }, [store, basePath]);
  useSyncPaneRegistry();
  const route = useRoute();
  const state = useRouteState();
  const index = useIndexMatch(basePath);

  // A resolved route whose slots all match registered panes → render it.
  if (route) return route;
  // The ONLY case that renders the index/landing pane is a GENUINE bare app root:
  // a resolved route with zero slots. Everything else — an unresolved (pending /
  // not-found) URL, or a resolved route whose slots don't resolve yet (a deferred
  // plugin still loading, or stale paneIds from an old bundle) — returns null so
  // the layout renders its tri-state DeferredRouteFallback (spinner while
  // loading, then NotFound / app-load-error), never the homepage at a deep link.
  if (state.kind === "resolved" && state.slots.length === 0) return index;
  return null;
}

// ---------------------------------------------------------------------------
// openPane — imperative (non-hook) open. Targets the live store, matching the
// historical module-global behavior for the ~40 imperative call sites.
// The non-positional open logic itself lives on the store (`openPaneImpl`).
// ---------------------------------------------------------------------------

export type PaneOpenMode = "root" | "push" | "swap";

export function openPane<
  Params = Record<string, string>,
  Options extends object = NoOptions,
  HintT extends object = NoHint,
>(
  target: PaneObject<Params, any, Options, HintT>,
  params: NoInfer<Params>,
  opts: { mode: "root"; options?: Partial<Options>; hint?: HintT },
): void {
  liveStore.openPaneImpl(target._internal, params as Record<string, string>, {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- overload narrows mode to "root" but the check keeps this future-proof for additional modes
    root: opts.mode === "root",
    options: opts.options as PaneOptions | undefined,
    hint: opts.hint as PaneHintBag | undefined,
  });
}

// ---------------------------------------------------------------------------
// useOpenPane — caller-aware pane navigation hook. Operates on the *context*
// store (the surface it is rendered in).
// ---------------------------------------------------------------------------

/**
 * The caller-aware open function returned by {@link useOpenPane}. Generic on the
 * target pane's declared `Params`, `Options`, and `Hint`, so all three are
 * type-checked against the pane that owns them at the call site. `params` is
 * checked against the target pane's full param set (not coerced to
 * `Record<string, string>`): a paramless pane rejects stray keys and a paramful
 * pane requires its declared params. Likewise a pane declaring no `options` /
 * no `hint` rejects them outright.
 */
export interface OpenPaneFn {
  <
    Params = Record<string, string>,
    Options extends object = NoOptions,
    HintT extends object = NoHint,
  >(
    target: PaneObject<Params, any, Options, HintT>,
    params: NoInfer<Params>,
    opts: {
      mode: PaneOpenMode;
      side?: "left" | "right";
      options?: Partial<Options>;
      hint?: HintT;
    },
  ): void;
}

export function useOpenPane(): OpenPaneFn {
  const store = usePaneStore();
  const callerInstanceId = useContext(PaneInstanceContext);

  return useCallback(
    (
      target: AnyPane,
      params: Record<string, string>,
      opts: {
        mode: PaneOpenMode;
        side?: "left" | "right";
        options?: PaneOptions;
        hint?: PaneHintBag;
      },
    ) => {
      const targetInternal = target._internal;
      const options = opts.options ?? {};
      const hint = opts.hint ?? {};

      if (opts.mode === "root" || callerInstanceId === undefined) {
        store.openPaneImpl(targetInternal, params, { root: opts.mode === "root", options, hint });
        return;
      }

      const currentRoute = store.getRoute();
      const callerIndex = currentRoute.findIndex(
        (s) => s.instanceId === callerInstanceId,
      );
      if (callerIndex < 0) {
        store.openPaneImpl(targetInternal, params, { options, hint });
        return;
      }

      const callerPaneId = currentRoute[callerIndex]!.paneId;
      const ownParams = extractOwnParams(targetInternal, params);
      const replace = !targetInternal.chrome.history;

      // swap: update the caller's slot in-place (same column), truncating
      // children. Used when internal navigation within a pane wants to swap
      // which entity is shown without growing the route (e.g. clicking a
      // dependency chip switches the task detail to a different task).
      if (opts.mode === "swap" && targetInternal.id === callerPaneId) {
        const existing = currentRoute[callerIndex]!;
        const sameParams =
          Object.keys(ownParams).length === Object.keys(existing.params).length &&
          Object.keys(ownParams).every((k) => ownParams[k] === existing.params[k]);
        if (sameParams && sameOptions(options, existing.options)) return;
        const newRoute = currentRoute.slice(0, callerIndex + 1);
        newRoute[callerIndex] = createSlot(targetInternal.id, ownParams, options, hint);
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
            createSlot(targetInternal.id, ownParams, options, hint),
            ...currentRoute.slice(callerIndex),
          ];
          store.setRoute(newRoute, replace);
          return;
        }
      }

      // push right (default): truncate after caller, append target
      const newRoute = [
        ...currentRoute.slice(0, callerIndex + 1),
        createSlot(targetInternal.id, ownParams, options, hint),
      ];
      store.setRoute(newRoute, replace);
    },
    [store, callerInstanceId],
  ) as OpenPaneFn;
}
