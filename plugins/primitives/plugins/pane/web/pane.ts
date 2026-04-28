import {
  createContext,
  createElement,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ComponentType,
  type ReactNode,
} from "react";
import { defineSlot, type Slot } from "@core";

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
// `type<T>()` — a phantom marker used to declare the `provides` shape at the
// type level. The runtime value is irrelevant; only the generic parameter is
// read by `InferProvides`.
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
  expand?: (params: Params) => string;
}

interface NormalizedChrome {
  enabled: boolean;
  title?: string | ((params: Record<string, string>) => string);
  history: boolean;
  close: boolean;
  expand?: (params: Record<string, string>) => string;
}

export interface PaneInternal {
  id: string;
  parent: PaneInternal | null;
  ownPath: string;
  fullPath: string;
  component: ComponentType;
  chrome: NormalizedChrome;
  children: PaneInternal[];
  dataContext: ReturnType<typeof createContext<unknown>>;
  actionsSlot: Slot<{ component: ComponentType; position?: "left" | "right" }>;
}

const registry = new Map<string, PaneInternal>();
const topLevel: PaneInternal[] = [];

export function _getAllPanes(): PaneInternal[] {
  return Array.from(registry.values());
}

export function _getTopLevelPanes(): PaneInternal[] {
  return topLevel;
}

const DATA_NOT_PROVIDED = Symbol("pane.data-not-provided");

// ---------------------------------------------------------------------------
// Path helpers.
// ---------------------------------------------------------------------------

function joinPath(parent: PaneInternal | null, own: string | undefined): string {
  const trimmed = (own ?? "").replace(/^\/+|\/+$/g, "");
  const parentPath = parent?.fullPath ?? "";
  if (!trimmed) return parentPath || "/";
  if (own && own.startsWith("/")) return "/" + trimmed;
  if (!parent) return "/" + trimmed;
  const base = parentPath === "/" ? "" : parentPath;
  return base + "/" + trimmed;
}

export function buildUrl(
  pane: PaneInternal,
  params: Record<string, string>,
): string {
  const parts = pane.fullPath.split("/").map((seg) => {
    if (!seg.startsWith(":")) return seg;
    const wildcard = seg.endsWith("*");
    const name = seg.slice(1).replace(/\*$/, "");
    const val = params[name];
    if (val === undefined) {
      throw new Error(
        `Pane "${pane.id}": missing param "${name}" for path "${pane.fullPath}"`,
      );
    }
    return wildcard
      ? val.split("/").map(encodeURIComponent).join("/")
      : encodeURIComponent(val);
  });
  return parts.join("/") || "/";
}

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
  pane: PaneInternal;
  /** Own-only params (only `:name`s from this pane's `ownPath`). */
  params: Record<string, string>;
  /** All params up to and including this pane's `fullPath`. Used for
   *  re-building URLs via `buildUrl(pane, fullParams)`. */
  fullParams: Record<string, string>;
}

export interface PaneMatch {
  chain: MatchEntry[];
}

export function matchRegistry(pathname: string): PaneMatch | null {
  let best: { pane: PaneInternal; depth: number } | null = null;
  for (const pane of registry.values()) {
    const params = matchPath(pane.fullPath, pathname);
    if (!params) continue;
    let d = 0;
    for (let p: PaneInternal | null = pane; p; p = p.parent) d++;
    if (!best || d > best.depth) best = { pane, depth: d };
  }
  if (!best) return null;

  const reversed: PaneInternal[] = [];
  for (let p: PaneInternal | null = best.pane; p; p = p.parent) reversed.push(p);
  const orderedPanes = reversed.reverse();
  // Ancestor panes have shorter fullPaths than `pathname`, so they can only
  // match in prefix mode. The leaf match (exact) is re-derived with prefix=true
  // too — its fullPath consumes the whole path, so prefix mode is equivalent.
  //
  // Params are kept own-only per design: each pane only receives the params
  // whose `:name` appeared in that pane's own `ownPath`. Ancestor access is
  // explicit via `ancestorPane.useParams()`.
  const chain: MatchEntry[] = orderedPanes.map((pane) => {
    const full = matchPath(pane.fullPath, pathname, { prefix: true }) ?? {};
    const own: Record<string, string> = {};
    for (const name of ownParamNames(pane.ownPath)) {
      if (name in full) own[name] = full[name]!;
    }
    return { pane, params: own, fullParams: full };
  });
  return { chain };
}

function ownParamNames(ownPath: string): string[] {
  if (!ownPath) return [];
  return ownPath
    .split("/")
    .filter((seg) => seg.startsWith(":"))
    .map((seg) => seg.slice(1).replace(/\*$/, ""));
}

// ---------------------------------------------------------------------------
// Router contexts.
// ---------------------------------------------------------------------------

export const PaneMatchContext = createContext<PaneMatch | null>(null);
export const PaneDepthContext = createContext<number>(-1);

export function usePaneMatch(): PaneMatch | null {
  return useContext(PaneMatchContext);
}

export function useCurrentPane(): PaneInternal | null {
  const match = useContext(PaneMatchContext);
  const depth = useContext(PaneDepthContext);
  if (!match || depth < 0) return null;
  return match.chain[depth]?.pane ?? null;
}

// ---------------------------------------------------------------------------
// Navigation + location hook.
// ---------------------------------------------------------------------------

function navigate(url: string): void {
  if (typeof window === "undefined") return;
  if (window.location.pathname === url) return;
  window.history.pushState({}, "", url);
  window.dispatchEvent(new PopStateEvent("popstate"));
  window.dispatchEvent(new CustomEvent("shell:navigate"));
}

export function usePathname(): string {
  const [pathname, setPathname] = useState(() =>
    typeof window === "undefined" ? "/" : window.location.pathname,
  );
  useEffect(() => {
    const onChange = () => setPathname(window.location.pathname);
    window.addEventListener("popstate", onChange);
    window.addEventListener("shell:navigate", onChange);
    return () => {
      window.removeEventListener("popstate", onChange);
      window.removeEventListener("shell:navigate", onChange);
    };
  }, []);
  return pathname;
}

// ---------------------------------------------------------------------------
// PaneObject — the value returned by `Pane.define`.
// ---------------------------------------------------------------------------

/**
 * Typed handle returned by `Pane.define`.
 *
 * `FullParams` is the full resolved param set including ancestors — used for
 * `open()` and path construction. `OwnParams` is only the `:name`s declared in
 * this pane's own `path` — what `useParams()` returns. Keeping them separate
 * matches design decision 6 ("params are own-only").
 */
export interface PaneObject<
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  FullParams = {},
  Provides = void,
  OwnParams = FullParams,
> {
  id: string;
  path: string;
  Provider: ComponentType<{ value: Provides; children: ReactNode }>;
  useParams(): OwnParams;
  useData(): Provides;
  open(params: FullParams): void;
  close(): void;
  expand(): void;
  back(): void;
  forward(): void;
  Actions: Slot<{ component: ComponentType; position?: "left" | "right" }>;
  /** Internal. Consumers should not rely on this. */
  _internal: PaneInternal;
}

function makePaneObject(internal: PaneInternal): PaneObject<any, any, any> {
  const { dataContext, actionsSlot } = internal;

  const Provider = ({
    value,
    children,
  }: {
    value: unknown;
    children: ReactNode;
  }) => createElement(dataContext.Provider, { value }, children);

  function useParams(): Record<string, string> {
    const match = useContext(PaneMatchContext);
    if (!match) {
      throw new Error(
        `Pane "${internal.id}".useParams() called outside <PaneRouter/>.`,
      );
    }
    const entry = match.chain.find((e) => e.pane === internal);
    if (!entry) {
      throw new Error(
        `Pane "${internal.id}".useParams() called but pane is not in the current match chain.`,
      );
    }
    return entry.params;
  }

  function useData(): unknown {
    const value = useContext(dataContext);
    if (value === DATA_NOT_PROVIDED) {
      throw new Error(
        `Pane "${internal.id}".useData() called but the pane component did not render <${internal.id}.Provider>.`,
      );
    }
    return value;
  }

  function open(params: Record<string, string>): void {
    navigate(buildUrl(internal, params ?? {}));
  }

  function close(): void {
    const parent = internal.parent;
    if (!parent) return;
    if (typeof window === "undefined") return;
    const match = matchRegistry(window.location.pathname);
    const parentEntry = match?.chain.find((e) => e.pane === parent);
    // Need fullParams here: buildUrl walks parent.fullPath and requires every
    // `:name` along it, including ancestor-contributed ones.
    const params = parentEntry?.fullParams ?? {};
    navigate(buildUrl(parent, params));
  }

  function expand(): void {
    if (typeof window === "undefined") return;
    const match = matchRegistry(window.location.pathname);
    const entry = match?.chain.find((e) => e.pane === internal);
    if (!entry) return;
    // chrome.expand receives the full resolved params (ancestor + own) so it
    // can build URLs that reference ancestor params, e.g.
    // `expand: ({ convId }) => \`/c/${convId}\``.
    const target = internal.chrome.expand?.(entry.fullParams);
    if (target) navigate(target);
  }

  function back(): void {
    if (typeof window !== "undefined") window.history.back();
  }

  function forward(): void {
    if (typeof window !== "undefined") window.history.forward();
  }

  return {
    id: internal.id,
    path: internal.fullPath,
    Provider: Provider as ComponentType<{ value: unknown; children: ReactNode }>,
    useParams,
    useData,
    open,
    close,
    expand,
    back,
    forward,
    Actions: actionsSlot,
    _internal: internal,
  };
}

function normalizeChrome<Params>(
  chrome: PaneChromeConfig<Params> | false | undefined,
): NormalizedChrome {
  if (chrome === false) return { enabled: false, history: false, close: false };
  return {
    enabled: true,
    title: chrome?.title as NormalizedChrome["title"],
    history: chrome?.history ?? true,
    close: chrome?.close ?? true,
    expand: chrome?.expand as NormalizedChrome["expand"],
  };
}

// ---------------------------------------------------------------------------
// Pane.define — factory + registration.
// ---------------------------------------------------------------------------

// ParentParams defaults to `{}` so that top-level panes (no parent) end up
// with `{} & InferParams<Path>` = `InferParams<Path>`. Using
// `Record<string, never>` as the default would clash with any own params.
interface DefineArgs<Path extends string, Provides, ParentParams> {
  id: string;
  parent?: PaneObject<ParentParams, any, any>;
  path?: Path;
  component: ComponentType;
  provides?: TypeMarker<Provides>;
  chrome?: PaneChromeConfig<ParentParams & InferParams<Path>> | false;
}

function define<
  Path extends string = "",
  Provides = void,
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  ParentParams = {},
>(
  args: DefineArgs<Path, Provides, ParentParams>,
): PaneObject<
  ParentParams & InferParams<Path>,
  Provides,
  InferParams<Path>
> {
  if (registry.has(args.id)) {
    // HMR can redefine during development; keep the new internal and move on.
    console.warn(`Pane "${args.id}" redefined.`);
  }
  const parentInternal = args.parent?._internal ?? null;
  const fullPath = joinPath(parentInternal, args.path);

  const dataContext = createContext<unknown>(DATA_NOT_PROVIDED);
  dataContext.displayName = `PaneData(${args.id})`;

  const actionsSlot = defineSlot<{
    component: ComponentType;
    position?: "left" | "right";
  }>(`pane.${args.id}.actions`);

  const internal: PaneInternal = {
    id: args.id,
    parent: parentInternal,
    ownPath: args.path ?? "",
    fullPath,
    component: args.component,
    chrome: normalizeChrome(args.chrome),
    children: [],
    dataContext,
    actionsSlot,
  };

  registry.set(args.id, internal);
  if (parentInternal) parentInternal.children.push(internal);
  else topLevel.push(internal);

  return makePaneObject(internal) as PaneObject<
    ParentParams & InferParams<Path>,
    Provides,
    InferParams<Path>
  >;
}

export const Pane = { define };

// ---------------------------------------------------------------------------
// Memoized match used by the router and Outlet.
// ---------------------------------------------------------------------------

export function useMatchForPath(pathname: string): PaneMatch | null {
  return useMemo(() => matchRegistry(pathname), [pathname]);
}
