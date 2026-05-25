import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useSyncExternalStore,
  type ComponentType,
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
   * makes it the root of a fresh chain. Defaults to `true`; only shown
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
  /** Own URL segment (no leading slash). Used by the chain URL parser/builder. */
  segment: string;
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
  /** All params accumulated from the chain root up to and including this pane. */
  fullParams: Record<string, string>;
  /** Caller-provided input data, persisted in the slot (not in the URL). */
  input: Record<string, string>;
}

export interface PaneMatch {
  chain: MatchEntry[];
}

// ---------------------------------------------------------------------------
// Chain-based URL parser + builder.
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
  const chain: PaneSlot[] = [];

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

    chain.push(createSlot(bestMatch.pane.id, bestMatch.params));
    cursor += bestMatch.consumed;
  }

  // Root URL ("/") — find any pane with an empty/root segment.
  if (chain.length === 0) {
    for (const pane of registry.values()) {
      if (!pane.segment || pane.segment === "/" || pane.segment === "") {
        chain.push(createSlot(pane.id, {}));
        break;
      }
    }
  }

  return chain.length > 0 ? chain : null;
}

export function buildChainUrl(chain: PaneSlot[]): string {
  if (chain.length === 0) return "/";

  const parts: string[] = [];
  for (const slot of chain) {
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
// Layout chain store — the primary source of truth for what's on screen.
// ---------------------------------------------------------------------------

let currentChain: PaneSlot[] = [];
const chainListeners = new Set<() => void>();

export function getChain(): PaneSlot[] {
  return currentChain;
}

function notifyChainListeners(): void {
  for (const fn of chainListeners) fn();
}

function subscribeChain(cb: () => void): () => void {
  chainListeners.add(cb);
  return () => chainListeners.delete(cb);
}

function getChainSnapshot(): PaneSlot[] {
  return currentChain;
}

function useChain(): PaneSlot[] {
  return useSyncExternalStore(subscribeChain, getChainSnapshot, () => []);
}

function setChain(chain: PaneSlot[], replace = false): void {
  currentChain = chain;
  notifyChainListeners();
  const url = buildChainUrl(chain);
  const serialized = chain.map(s => ({ paneId: s.paneId, params: s.params, input: s.input, uuid: s.uuid }));
  const fullUrl = applyBasePath(url);
  if (fullUrl === window.location.pathname && replace) return;
  const method = replace ? "replaceState" : "pushState";
  window.history[method]({ chain: serialized }, "", fullUrl);
  window.dispatchEvent(new PopStateEvent("popstate"));
  window.dispatchEvent(new CustomEvent("shell:navigate"));
}

function chainsEqual(a: PaneSlot[], b: PaneSlot[]): boolean {
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

export function reorderChain(fromIndex: number, toIndex: number): void {
  if (typeof window === "undefined") return;
  const chain = [...currentChain];
  if (fromIndex < 0 || fromIndex >= chain.length) return;
  if (toIndex < 0 || toIndex >= chain.length) return;
  if (fromIndex === toIndex) return;
  const [item] = chain.splice(fromIndex, 1);
  chain.splice(toIndex, 0, item!);
  setChain(chain);
}

export function restoreChain(
  slots: Array<{ paneId: string; params: Record<string, string>; input?: Record<string, string> }>,
): void {
  if (typeof window === "undefined") return;
  const chain: PaneSlot[] = slots.map((s) => createSlot(s.paneId, s.params, s.input ?? {}));
  if (chain.length === 0) return;
  setChain(chain);
}

export function syncChainFromUrl(pathname: string): void {
  const parsed = parseUrl(pathname);
  const newChain = parsed ?? [];
  if (chainsEqual(currentChain, newChain)) return;
  currentChain = newChain;
  notifyChainListeners();
}

let prevResolvedByUuid = new Map<string, MatchEntry>();

function resolveChain(chain: PaneSlot[]): PaneMatch | null {
  if (chain.length === 0) {
    prevResolvedByUuid = new Map();
    return null;
  }
  const entries: MatchEntry[] = [];
  const accumulated: Record<string, string> = {};
  let chainStable = true;
  for (const slot of chain) {
    const pane = registry.get(slot.paneId);
    if (!pane) {
      prevResolvedByUuid = new Map();
      return null;
    }
    Object.assign(accumulated, slot.params);
    const prev = prevResolvedByUuid.get(slot.uuid);
    if (chainStable && prev && prev.pane === pane) {
      entries.push(prev);
    } else {
      chainStable = false;
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
  return { chain: entries };
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
  return match.chain.find(e => e.instanceId === instanceId)?.pane ?? null;
}

// ---------------------------------------------------------------------------
// App-scoped basePath. The active app's path (e.g. "/debug") is an implicit
// URL prefix: navigate() prepends it, MillerColumns strips it before matching.
// Pane segments stay app-local — no manual prefix needed.
// ---------------------------------------------------------------------------

export const PaneBasePathContext = createContext<string>("");

let currentBasePath = "";

export function setBasePath(basePath: string): void {
  currentBasePath = basePath === "/" ? "" : basePath.replace(/\/+$/, "");
}

export function getBasePath(): string {
  return currentBasePath;
}

export function stripBasePath(pathname: string, basePath: string): string {
  const bp = basePath === "/" ? "" : basePath.replace(/\/+$/, "");
  if (!bp) return pathname;
  if (pathname === bp) return "/";
  if (pathname.startsWith(bp + "/")) return pathname.slice(bp.length);
  return pathname;
}

function applyBasePath(rawUrl: string): string {
  if (!currentBasePath) return rawUrl;
  if (rawUrl === "/") return currentBasePath;
  return currentBasePath + rawUrl;
}

// ---------------------------------------------------------------------------
// URL → chain sync (module-level listener, outside React render).
// ---------------------------------------------------------------------------

function handleLocationChange(): void {
  if (typeof window === "undefined") return;
  const state = window.history.state as { chain?: Array<{ paneId: string; params: Record<string, string>; input?: Record<string, string>; uuid?: string }> } | null;
  if (state?.chain) {
    const newChain = state.chain.map(s => createSlot(s.paneId, s.params, s.input ?? {}, s.uuid));
    if (chainsEqual(currentChain, newChain)) return;
    currentChain = newChain;
    notifyChainListeners();
  } else {
    const pathname = stripBasePath(window.location.pathname, currentBasePath);
    syncChainFromUrl(pathname);
  }
}

if (typeof window !== "undefined") {
  window.addEventListener("popstate", handleLocationChange);
  window.addEventListener("shell:navigate", handleLocationChange);
}

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

export interface PaneChainEntry<OwnParams = Record<string, string>> {
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
  /** Find this pane in the current chain. Returns its params or null if absent. */
  useChainEntry(): PaneChainEntry<OwnParams> | null;
  /** Find all instances of this pane in the current chain (for panes that can appear multiple times). */
  useChainEntries(): PaneChainEntry<OwnParams>[];
  close(instanceId: number): void;
  /** Remove this pane from the chain while preserving its children. */
  unwrap(instanceId: number): void;
  /** Detach from ancestors and make this pane the root of a fresh chain. */
  promote(instanceId: number): void;
  /** Hook: returns a bound close function for the current instance, or null if root/not in chain. */
  useClose(): (() => void) | null;
  /** Hook: returns a bound promote function for the current instance, or null if root/not in chain. */
  usePromote(): (() => void) | null;
  /** Hook: toggle this pane open/closed relative to the caller's position in the chain. */
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
      const entry = match.chain.find(e => e.instanceId === instanceId);
      if (entry?.pane === internal) return entry.params;
    }
    const entry = match.chain.find((e) => e.pane === internal);
    if (!entry) {
      throw new Error(
        `Pane "${internal.id}".useParams() called but pane is not in the current match chain.`,
      );
    }
    return entry.params;
  }

  function useInput(): Record<string, string> {
    const match = useContext(PaneMatchContext);
    const instanceId = useContext(PaneInstanceContext);
    if (!match) return {};
    if (instanceId !== undefined) {
      const entry = match.chain.find(e => e.instanceId === instanceId);
      if (entry?.pane === internal) return entry.input;
    }
    const entry = match.chain.find(e => e.pane === internal);
    return entry?.input ?? {};
  }

  function useChainEntry(): PaneChainEntry | null {
    const match = useContext(PaneMatchContext);
    if (!match) return null;
    const entry = match.chain.find((e) => e.pane === internal);
    if (!entry) return null;
    return { instanceId: entry.instanceId, uuid: entry.uuid, params: entry.params, fullParams: entry.fullParams, input: entry.input };
  }

  function useChainEntries(): PaneChainEntry[] {
    const match = useContext(PaneMatchContext);
    if (!match) return [];
    return match.chain
      .filter((e) => e.pane === internal)
      .map((e) => ({ instanceId: e.instanceId, uuid: e.uuid, params: e.params, fullParams: e.fullParams, input: e.input }));
  }

  function close(instanceId: number): void {
    if (typeof window === "undefined") return;
    const chain = getChain();
    const idx = chain.findIndex((s) => s.instanceId === instanceId);
    if (idx <= 0) return;
    const newChain = chain.slice(0, idx);
    const replace = internal.chrome.enabled && !internal.chrome.history;
    setChain(newChain, replace);
  }

  function unwrap(instanceId: number): void {
    if (typeof window === "undefined") return;
    const chain = getChain();
    const idx = chain.findIndex((s) => s.instanceId === instanceId);
    if (idx < 0) return;
    const newChain = [...chain.slice(0, idx), ...chain.slice(idx + 1)];
    setChain(newChain);
  }

  function promote(instanceId: number): void {
    if (typeof window === "undefined") return;
    const chain = getChain();
    const idx = chain.findIndex((s) => s.instanceId === instanceId);
    if (idx < 0) return;
    const fullParams: Record<string, string> = {};
    for (let i = 0; i <= idx; i++) {
      Object.assign(fullParams, chain[i]!.params);
    }
    openPaneImpl(internal, fullParams, { root: true, input: chain[idx]!.input });
  }

  function back(): void {
    if (typeof window !== "undefined") window.history.back();
  }

  function forward(): void {
    if (typeof window !== "undefined") window.history.forward();
  }

  function useClose(): (() => void) | null {
    const instanceId = useContext(PaneInstanceContext);
    const chain = useChain();
    return useMemo(() => {
      if (instanceId === undefined) return null;
      const idx = chain.findIndex((s) => s.instanceId === instanceId);
      if (idx <= 0) return null;
      return () => close(instanceId);
    }, [instanceId, chain]);
  }

  function usePromote(): (() => void) | null {
    const instanceId = useContext(PaneInstanceContext);
    const chain = useChain();
    return useMemo(() => {
      if (instanceId === undefined) return null;
      const idx = chain.findIndex((s) => s.instanceId === instanceId);
      if (idx < 0) return null;
      if (idx === 0) return null;
      return () => promote(instanceId);
    }, [instanceId, chain]);
  }

  function useToggle(
    params: Record<string, string>,
    opts?: PaneToggleOpts,
  ): { isOpen: boolean; toggle: () => void } {
    const callerInstanceId = useContext(PaneInstanceContext);
    const chain = useChain();
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
        ? chain.findIndex((s) => s.instanceId === callerInstanceId)
        : -1;
    const searchFrom = callerIndex >= 0 ? callerIndex + 1 : 0;
    const targetSlot =
      chain.slice(searchFrom).find((s) => s.paneId === internal.id) ?? null;
    const isOpen = targetSlot !== null;

    const toggle = useCallback(() => {
      if (targetSlot) {
        if (action === "unwrap") {
          unwrap(targetSlot.instanceId);
        } else {
          close(targetSlot.instanceId);
        }
      } else {
        openPaneFn(paneObject, paramsRef.current, { mode, side, input: inputRef.current });
      }
    }, [targetSlot, action, openPaneFn, mode, side]);

    return { isOpen, toggle };
  }

  const paneObject: PaneObject<any, any, any> = {
    id: internal.id,
    useParams,
    useInput,
    useChainEntry,
    useChainEntries,
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
    // Re-sync the chain from the current URL now that the registry is
    // populated. On initial load the module-level handleLocationChange()
    // runs before any panes are registered, so the chain stays empty
    // until this re-sync.
    handleLocationChange();
  }, [contributions]);
}

// ---------------------------------------------------------------------------
// Memoized match used by MillerColumns.
// ---------------------------------------------------------------------------

export function useMatchForChain(): PaneMatch | null {
  const chain = useChain();
  return useMemo(() => resolveChain(chain), [chain]);
}

/** @deprecated Use useMatchForChain */
export const useMatchForPath = (_pathname: string) => useMatchForChain();

// ---------------------------------------------------------------------------
// openPaneImpl — non-positional open logic (shared by useOpenPane fallbacks).
// ---------------------------------------------------------------------------

function openPaneImpl(
  internal: PaneInternal,
  params: Record<string, string>,
  opts?: { root?: boolean; input?: Record<string, string> },
): void {
  const replace = internal.chrome.enabled && !internal.chrome.history;
  const chain = getChain();
  const ownParams = extractOwnParams(internal, params);
  const input = opts?.input ?? {};

  if (!opts?.root) {
    const existingIdx = chain.findIndex((s) => s.paneId === internal.id);
    if (existingIdx >= 0) {
      const existing = chain[existingIdx]!;
      const sameParams =
        Object.keys(ownParams).length === Object.keys(existing.params).length &&
        Object.keys(ownParams).every((k) => ownParams[k] === existing.params[k]);
      const sameInput =
        Object.keys(input).length === Object.keys(existing.input).length &&
        Object.keys(input).every((k) => input[k] === existing.input[k]);
      if (sameParams && sameInput) return;
      const newChain = chain.slice(0, existingIdx + 1);
      newChain[existingIdx] = createSlot(internal.id, ownParams, input);
      setChain(newChain, replace);
      return;
    }
  }

  // Build fresh chain from defaultAncestors
  const ancestorSlots: PaneSlot[] = [];
  for (const ancestor of internal.defaultAncestors) {
    const ancestorInternal = registry.get(ancestor.id);
    if (!ancestorInternal) continue;
    // Inherit params from existing chain if available
    const existingSlot = chain.find(s => s.paneId === ancestor.id);
    const ancestorParams = existingSlot
      ? existingSlot.params
      : extractOwnParams(ancestorInternal, params);
    ancestorSlots.push(createSlot(ancestor.id, ancestorParams));
  }
  setChain([...ancestorSlots, createSlot(internal.id, ownParams, input)], replace);
}

export type PaneOpenMode = "root" | "push" | "swap";

export function openPane(
  target: PaneObject<any, any, any>,
  params: Record<string, string>,
  opts: { mode: "root"; input?: Record<string, string> },
): void {
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- overload narrows mode to "root" but the check keeps this future-proof for additional modes
  openPaneImpl(target._internal, params, { root: opts.mode === "root", input: opts.input });
}

// ---------------------------------------------------------------------------
// useOpenPane — caller-aware pane navigation hook.
// ---------------------------------------------------------------------------

export function useOpenPane(): (
  target: PaneObject<any, any, any>,
  params: Record<string, string>,
  opts: { mode: PaneOpenMode; side?: "left" | "right"; input?: Record<string, string> },
) => void {
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
        openPaneImpl(targetInternal, params, { root: opts.mode === "root", input });
        return;
      }

      const currentChain = getChain();
      const callerIndex = currentChain.findIndex(
        (s) => s.instanceId === callerInstanceId,
      );
      if (callerIndex < 0) {
        openPaneImpl(targetInternal, params, { input });
        return;
      }

      const callerPaneId = currentChain[callerIndex]!.paneId;
      const ownParams = extractOwnParams(targetInternal, params);
      const replace =
        targetInternal.chrome.enabled && !targetInternal.chrome.history;

      // swap: update the caller's slot in-place (same column), truncating
      // children. Used when internal navigation within a pane wants to swap
      // which entity is shown without growing the chain (e.g. clicking a
      // dependency chip switches the task detail to a different task).
      if (opts.mode === "swap" && targetInternal.id === callerPaneId) {
        const existing = currentChain[callerIndex]!;
        const sameParams =
          Object.keys(ownParams).length === Object.keys(existing.params).length &&
          Object.keys(ownParams).every((k) => ownParams[k] === existing.params[k]);
        const sameInput =
          Object.keys(input).length === Object.keys(existing.input).length &&
          Object.keys(input).every((k) => input[k] === existing.input[k]);
        if (sameParams && sameInput) return;
        const newChain = currentChain.slice(0, callerIndex + 1);
        newChain[callerIndex] = createSlot(targetInternal.id, ownParams, input);
        setChain(newChain, replace);
        return;
      }

      if (opts.side === "left") {
        const alreadyAncestor = currentChain
          .slice(0, callerIndex)
          .some((s) => s.paneId === targetInternal.id);
        if (!alreadyAncestor) {
          const newChain = [
            ...currentChain.slice(0, callerIndex),
            createSlot(targetInternal.id, ownParams, input),
            ...currentChain.slice(callerIndex),
          ];
          setChain(newChain, replace);
          return;
        }
      }

      // push right (default): truncate after caller, append target
      const newChain = [
        ...currentChain.slice(0, callerIndex + 1),
        createSlot(targetInternal.id, ownParams, input),
      ];
      setChain(newChain, replace);
    },
    [callerInstanceId],
  );
}
