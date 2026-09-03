// ---------------------------------------------------------------------------
// Pure-data route identity, reachable from BOTH server and web. Holds no React
// and no browser/runtime dependency, so a server plugin can build the exact
// same app-rooted link a pane resolves to at runtime — one source of truth for
// segment param substitution and `:param` name inference.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Type machinery — extract `:param` and `:param*` names from a path template.
// ---------------------------------------------------------------------------

type ParamName<S extends string> = S extends `${infer N}*` ? N : S;

type ExtractParams<Path extends string> =
  Path extends `${infer Seg}/${infer Rest}`
    ? (Seg extends `:${infer P}` ? { [K in ParamName<P>]: string } : {}) &
        ExtractParams<Rest>
    : Path extends `:${infer P}`
      ? { [K in ParamName<P>]: string }
      : {};

// Param inference for a route's own segment. The empty case is a plain `{}`
// with no index signature, deliberately: routes CHAIN their params
// (`ParentParams & RouteParams<Seg>`), and intersecting `Record<string, never>`
// (an `[k: string]: never` index signature) with a child's real params would
// collapse every property to `never`. `{} & { taskId: string }` stays precise.
// The closed, key-rejecting spelling is restored once, at the `PaneObject`
// boundary — see `Closed<>` in `web/pane.ts`.
//
// Exported so `Pane.define` can derive a route's OWN params from the `segment`
// literal its `RouteDef` carries — see the note on {@link RouteDef}.
//
// The template is the literal `string`, NOT `ExtractParams<Path>[K]`. Those are
// the same type for every concrete path — `ExtractParams` only ever produces
// `string`-valued properties — but the indexed-access spelling is one TS cannot
// evaluate while `Path` is still a type parameter, so `RouteParams<Seg>` did
// not satisfy `Record<string, string>` (TS2344: "`ExtractParams<Seg>[K]` is not
// assignable to `string`"). It has to: a route's own params are what
// `Pane.define` hands `ResolveHook`, which is keyed on `Record<string, string>`
// because URL params ARE strings. Saying `string` outright keeps that true and
// checkable rather than forcing the constraint to be loosened to `object`.
export type RouteParams<Path extends string> = {
  [K in keyof ExtractParams<Path>]: string;
};

// ---------------------------------------------------------------------------
// App identity — the base path an app is mounted under, passed explicitly to
// `link()`. Decoupled from the route so the same route can be linked under any
// app (the root app contributes "" via basePath "/").
// ---------------------------------------------------------------------------

export interface AppRef {
  readonly id: string;
  /**
   * Human-readable app name, e.g. "Pages", "Agent manager". THE single place an
   * app's display name is authored — chrome that points AT an app (rail
   * tooltip, tab fallback title, pane Expand) reads it from here rather than
   * restating it, so the same app can never be named two different things.
   */
  readonly name: string;
  /** App base path, e.g. "/agents", "/pages", or "/" for the root app. */
  readonly basePath: string;
  /**
   * MD icon key (snake_case, e.g. "piano", "bug_report") for this app's icon,
   * resolvable server-side via `resolveIconSvgNodes`. Must match the `MdXxx`
   * the web shell passes to `Apps.App({ icon: mdAppIcon(MdXxx) })` — enforced
   * by the `app-icon:key-in-sync` check.
   */
  readonly iconKey: string;
}

export function defineApp(def: {
  id: string;
  name: string;
  basePath: string;
  iconKey: string;
}): AppRef {
  return Object.freeze({
    id: def.id,
    name: def.name,
    basePath: def.basePath,
    iconKey: def.iconKey,
  });
}

// ---------------------------------------------------------------------------
// Pure per-segment substitution — the encoding shared by buildRouteUrl (web)
// and `RouteDef.path`. Given ONE segment pattern and a flat params object,
// returns the resolved URL parts. Supports static parts, ":name",
// ":name*" (wildcard, splits the value on "/"), and encodeURIComponent.
// Throws on a missing param (fail loud — matches buildRouteUrl).
// ---------------------------------------------------------------------------

/**
 * A segment named a `:param` nobody supplied, so this route has no URL.
 *
 * A TYPE rather than a message to match on, because exactly one caller has a
 * legitimate reason to treat it as an answer instead of a crash: a pane's
 * cross-app Expand asks for its own app-rooted URL from wherever it is being
 * rendered, and a pane whose ancestor is paramful can sit in a route that does
 * not contain that ancestor — nothing supplies the ancestor's param, so there
 * genuinely is no URL to offer. That caller narrows on this class and lets
 * every other failure propagate; a substring match on the message could not.
 */
export class MissingRouteParamError extends Error {
  constructor(
    readonly param: string,
    readonly segment: string,
  ) {
    super(`Missing param "${param}" for segment "${segment}"`);
    this.name = "MissingRouteParamError";
  }
}

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
      throw new MissingRouteParamError(name, segment);
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
// Route-path canonicalization — the address bar is UNTRUSTED INPUT.
//
// `window.location.pathname` is whatever the user typed, pasted, or a bad link
// carried. A pathname with repeated slashes (`//agents/c/x`) is not merely ugly:
//
//   • As a HISTORY URL it is a *scheme-relative* reference. `replaceState(s, "",
//     "//agents/c/x")` resolves against the document to `http://agents/c/x` — a
//     different origin — and the browser throws SecurityError, taking down boot.
//   • As a MATCH KEY it silently misses. `"//agents/c/x".startsWith("/agents/")`
//     is false, so the URL owns no app: the deep link resolves to nothing and
//     falls back to the default app.
//
// Both failures come from reading the raw pathname, so the fix is one canonical
// reader every routing consumer goes through — collapse repeated `/` runs and
// guarantee exactly one leading `/`. The `pane/no-raw-location-path` lint rule
// keeps it the only reader. Idempotent, so re-normalizing is always safe.
// ---------------------------------------------------------------------------

export function normalizeRoutePath(pathname: string): string {
  const collapsed = pathname.replace(/\/{2,}/g, "/");
  return collapsed.startsWith("/") ? collapsed : "/" + collapsed;
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

/**
 * A route carries TWO param sets, and confusing them is a live class of bug.
 *
 * - The CHAINED set — every ancestor's `:name` plus this route's own. That is
 *   what a URL needs, so it is what `path` / `link` take and what an opener
 *   must supply. It is the `Params` parameter.
 * - The OWN set — only the `:name`s in THIS route's `segment`. That is what the
 *   runtime hands a pane back: `MatchEntry.params` is own-only (the accumulated
 *   set lives beside it in `fullParams`), so a pane's `useParams()` and its
 *   `resolve` hook see own params and nothing else.
 *
 * The own set is NOT a second type parameter of its own: it is a function of
 * the `segment` this route already carries, which is why `segment` is typed by
 * its literal. `Pane.define` reads `RouteParams<Seg>` off it. (A separate
 * phantom `Own` parameter would appear in no member — `noUnusedParameters`
 * rejects that, and rightly: it would be inferred positionally rather than from
 * anything the value itself says, so annotating a route by hand could silently
 * drop it.) Before this, a chained pane's `useParams()` claimed its ancestor's
 * params too and returned `undefined` for them.
 */
export interface RouteDef<
  Params extends Record<string, string> = {},
  Seg extends string = string,
> {
  readonly id: string;
  /**
   * This route's own URL fragment, e.g. `"source/:sourceId"`. Typed by its
   * LITERAL so a consumer can derive the own param set from it (above).
   */
  readonly segment: Seg;
  readonly parent?: RouteDef<any, any>;
  /** Root-first ancestor pane ids (parent chain). Empty for a root route. */
  readonly parentPaneIds: string[];
  /** App-relative path, e.g. "/build/r/<id>". Takes the CHAINED params. */
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
  parent?: RouteDef<ParentParams, any>;
}): RouteDef<ParentParams & RouteParams<Seg>, Seg> {
  type Params = ParentParams & RouteParams<Seg>;

  // Root-first chain of RouteDefs, this route last.
  const chain: RouteDef<any, any>[] = [];
  for (let r: RouteDef<any, any> | undefined = def.parent; r; r = r.parent) {
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

  const route: RouteDef<Params, Seg> = {
    id: def.id,
    segment: def.segment,
    parent: def.parent,
    parentPaneIds,
    path: path as RouteDef<Params, Seg>["path"],
    link: link as RouteDef<Params, Seg>["link"],
  };
  return route;
}
