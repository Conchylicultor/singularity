// ---------------------------------------------------------------------------
// Pure-data route identity, reachable from BOTH server and web. Holds no React
// and no browser/runtime dependency, so a server plugin can build the exact
// same app-rooted link a pane resolves to at runtime — one source of truth for
// segment param substitution and `:param` name inference.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Type machinery — extract `:param` and `:param*` names from a path template.
// THE single definition of `InferParams`; pane/web imports it from here.
// ---------------------------------------------------------------------------

type ParamName<S extends string> = S extends `${infer N}*` ? N : S;

type ExtractParams<Path extends string> = Path extends `${infer Seg}/${infer Rest}`
  ? (Seg extends `:${infer P}` ? { [K in ParamName<P>]: string } : {}) &
      ExtractParams<Rest>
  : Path extends `:${infer P}`
    ? { [K in ParamName<P>]: string }
    : {};

export type InferParams<Path extends string> =
  ExtractParams<Path> extends infer O
    ? keyof O extends never
      ? Record<string, never>
      : { [K in keyof O]: O[K] }
    : never;

// Clean param inference for ROUTES. Unlike `InferParams` (whose empty case is
// `Record<string, never>` to keep legacy `useParams()` indexable), the empty
// case here is a plain `{}` with no index signature. Routes CHAIN their params
// (`ParentParams & RouteParams<Seg>`), and intersecting `Record<string, never>`
// (an `[k: string]: never` index signature) with a child's real params would
// collapse every property to `never`. `{} & { taskId: string }` stays precise.
type RouteParams<Path extends string> = {
  [K in keyof ExtractParams<Path>]: ExtractParams<Path>[K];
};

// ---------------------------------------------------------------------------
// App identity — the base path an app is mounted under, passed explicitly to
// `link()`. Decoupled from the route so the same route can be linked under any
// app (the root app contributes "" via basePath "/").
// ---------------------------------------------------------------------------

export interface AppRef {
  readonly id: string;
  /** App base path, e.g. "/agents", "/pages", or "/" for the root app. */
  readonly basePath: string;
}

export function defineApp(def: { id: string; basePath: string }): AppRef {
  return Object.freeze({ id: def.id, basePath: def.basePath });
}

// ---------------------------------------------------------------------------
// Pure per-segment substitution — the encoding shared by buildRouteUrl (web)
// and `RouteDef.path`. Given ONE segment pattern and a flat params object,
// returns the resolved URL parts. Supports static parts, ":name",
// ":name*" (wildcard, splits the value on "/"), and encodeURIComponent.
// Throws on a missing param (fail loud — matches buildRouteUrl).
// ---------------------------------------------------------------------------

export function fillSegment(
  segment: string,
  params: Record<string, string>,
): string[] {
  if (!segment || segment === "/") return [];

  const parts: string[] = [];
  for (const seg of segment.split("/").filter(Boolean)) {
    if (!seg.startsWith(":")) {
      parts.push(seg);
      continue;
    }
    const wildcard = seg.endsWith("*");
    const name = seg.slice(1).replace(/\*$/, "");
    const val = params[name];
    if (val === undefined) {
      throw new Error(`Missing param "${name}" for segment "${segment}"`);
    }
    if (wildcard) {
      parts.push(...val.split("/").map(encodeURIComponent));
    } else {
      parts.push(encodeURIComponent(val));
    }
  }
  return parts;
}

// ---------------------------------------------------------------------------
// Segment match-pattern normalization — param *names* are erased, only their
// structural shape survives. `s/:pageId` and `s/:serverId` both normalize to
// `s/:`, so two panes that match the same URLs collide; `page/:pageId`
// (`page/:`) does not collide with `s/:`. THE single definition: the runtime
// registry (`useSyncPaneRegistry`) enforces the globally-unique-segment
// invariant at registration, and the `pane:segments-unique` check enforces the
// same invariant statically at build time — both call this, so they can't drift.
// ---------------------------------------------------------------------------

export function normalizeSegmentPattern(segment: string): string {
  return segment
    .split("/")
    .map((part) => {
      if (part.startsWith(":") && part.endsWith("*")) return ":*";
      if (part.startsWith(":")) return ":";
      return part;
    })
    .join("/");
}

// ---------------------------------------------------------------------------
// RouteDef — a typed, pure route identity. Chains to a parent route; `path`
// builds the app-relative URL, `link` prepends an app's base path.
// ---------------------------------------------------------------------------

export interface RouteDef<Params extends Record<string, string> = {}> {
  readonly id: string;
  readonly segment: string;
  readonly parent?: RouteDef<any>;
  /** Root-first ancestor pane ids (parent chain). Empty for a root route. */
  readonly parentPaneIds: string[];
  /** App-relative path, e.g. "/build/r/<id>". */
  path(params: Params): string;
  /** Full app-rooted link, e.g. "/agents/build/r/<id>". Root app (basePath "/") contributes "". */
  link(app: AppRef, params: Params): string;
}

export function defineRoute<
  Seg extends string,
  ParentParams extends Record<string, string> = {},
>(def: {
  id: string;
  segment: Seg;
  parent?: RouteDef<ParentParams>;
}): RouteDef<ParentParams & RouteParams<Seg>> {
  type Params = ParentParams & RouteParams<Seg>;

  // Root-first chain of RouteDefs, this route last.
  const chain: RouteDef<any>[] = [];
  for (let r: RouteDef<any> | undefined = def.parent; r; r = r.parent) {
    chain.unshift(r);
  }
  const parentPaneIds = chain.map((r) => r.id);

  function path(params: Record<string, string>): string {
    const parts: string[] = [];
    for (const r of [...chain, route]) {
      parts.push(...fillSegment(r.segment, params));
    }
    return parts.length > 0 ? "/" + parts.join("/") : "/";
  }

  function link(app: AppRef, params: Record<string, string>): string {
    const base = app.basePath === "/" ? "" : app.basePath;
    return base + path(params);
  }

  const route: RouteDef<Params> = {
    id: def.id,
    segment: def.segment,
    parent: def.parent,
    parentPaneIds,
    path: path as RouteDef<Params>["path"],
    link: link as RouteDef<Params>["link"],
  };
  return route;
}
