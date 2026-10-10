import type {
  DependsOnEntry,
  ExternalResource,
  Resource,
  ResourceContract,
  ServerResourceOptions,
} from "@plugins/framework/plugins/resource-runtime/core";
import {
  isLivePageCursor,
  type LivePage,
  type LivePagedValue,
  type LivePageParams,
  type LivePageRequest,
  type LivePlainValue,
  type LiveQueryParams,
  type LiveQueryValue,
  type LiveValue,
  type LiveValueOrigin,
} from "@plugins/network/plugins/live/core";

// The option compilation behind BOTH `serveValue`s — the worktree one
// (`network/live/server`, on server-core's runtime) and the central one
// (`network/live/central`, on central-core's). It lives here, once, so the two
// barrels cannot drift: each only injects its runtime's two register
// primitives and shapes the served object its plugin definition takes.
//
// A served value declares WHERE its truth lives (`source`) and how to read it
// (`loader`), never a delivery mode: that is the `liveValue` declaration's
// `load`, which the client reads too.
// Everything else is one named option, each folded into the runtime's own
// two-arg `defineResource` / `defineExternalResource`:
//
// - `throttleMs`        → the runtime's `debounceMs` (a fixed trailing window,
//                         not re-armed — a throttle, whatever the old name said).
// - `recomputeOn`       → `dependsOn` edges, from EXTERNAL upstreams only (T15:
//                         a db upstream's writes reach this value's read-set
//                         through the change feed already, so a cascade would
//                         serve it twice). A bare served value recomputes
//                         every currently-subscribed tuple of THIS value (the
//                         runtime's `toSubscribed` edge; a param-less value
//                         always recomputes its one `{}` tuple). The mapped form
//                         `{ value, params }` is a plain per-tuple edge.
// - `whileSubscribed`   → the runtime's `onFirstSubscribe` / `onLastUnsubscribe`
//                         pair, owned here so a start without a stop cannot be
//                         written (see `pairLifecycle`).
// - `revalidate`        → passed through.
//
// A typed-query value (`liveValue(key, { query })`) and a paged one
// (`{ query, paged }`) are served by the same options, over their DECODED
// question: the loader, `whileSubscribed`, a mapped `recomputeOn` and
// `notify` take the question `Q` (the paged loader adds the page asked,
// `{ cursor, limit }`), and this file decodes each wire tuple through the
// declaration's own codec — the one the params gate and the browser's read use.

/** Where a value's truth lives: Postgres (change feed) or anything else (`notify`). */
export type LiveValueSource = "db" | "external";

/** Stops what a `whileSubscribed` start began. */
export type StopFn = () => void;

/**
 * Any served value, whichever runtime serves it — the runtime `Resource` plus
 * what `serveValue` records about it. An upstream in `recomputeOn` is one.
 */
export type ServedValueBase<T, P extends Record<string, string>> = Resource<
  T,
  P
> & {
  source: LiveValueSource;
  /** The collection-shaped value's recorded reason (db arm only). */
  unbounded?: { reason: string };
  /** `[key]` — symmetric with `ServedCollection.keys`. */
  keys: string[];
};

/**
 * A served value that can be a `recomputeOn` upstream: an EXTERNAL one — told
 * apart by its `notify`, which only the external arm has (T15). A db value
 * has none, so naming one in `recomputeOn` is a tsc error. `any`: an upstream
 * of any payload/params — `Resource` is invariant in both. One definition, for
 * the worktree and the central `serveValue` alike.
 */
// biome-ignore lint/suspicious/noExplicitAny: see above.
export type ExternalServed = ServedValueBase<any, any> & {
  // biome-ignore lint/suspicious/noExplicitAny: see above.
  notify(params?: any): void;
};

/** The params type an upstream served value is subscribed with. */
type UpstreamParams<S> = S extends { load(params: infer UP): unknown }
  ? UP
  : never;

/**
 * One `recomputeOn` entry for an upstream `S`: the bare served value
 * (recompute every subscribed tuple of this value), or `{ value, params }`
 * mapping the upstream's changed tuple to the ONE tuple of this value it moves.
 */
export type RecomputeEntry<S, P> =
  S | { value: S; params: (upstreamParams: UpstreamParams<S>) => P };

/**
 * `recomputeOn` typed per element: `R` is inferred from the array, so each
 * mapped entry's `params` sees ITS upstream's params and must return this
 * value's.
 */
export type RecomputeOn<R extends readonly ExternalServed[], P> = {
  [I in keyof R]: RecomputeEntry<R[I], P>;
};

/**
 * True when `T` could grow without bound as a single payload: an array, or a
 * string-indexed record. Distributive, so a union with ANY such arm (`Row[] |
 * null`) counts.
 */
type CollectionShaped<T> = T extends readonly unknown[]
  ? true
  : string extends keyof T
    ? true
    : false;

/**
 * The bound rule, as a type: a Postgres-backed value that is collection-shaped
 * must say why it is not a `liveCollection` (`unbounded: { reason }`), and
 * nothing else may say it. An in-memory (`external`) array is bounded by the
 * process that holds it, so it needs no reason.
 */
type BoundArm<Src extends LiveValueSource, T> = Src extends "db"
  ? true extends CollectionShaped<T>
    ? { unbounded: { reason: string } }
    : { unbounded?: never }
  : { unbounded?: never };

/**
 * `whileSubscribed` per arm: an external value is handed `notify` for the
 * subscribed tuple; a db value is driven by the change feed alone, so its hook
 * takes the params only (a second parameter is a tsc error).
 */
type WhileSubscribedArm<Src extends LiveValueSource, P> = Src extends "external"
  ? {
      /**
       * Start something for as long as a tuple has a subscriber (a watcher);
       * return what stops it. `notify` recomputes THIS tuple. Runs on the
       * tuple's first subscriber; its stop runs on the last unsubscribe —
       * after the start resolves, if the unsubscribe comes first.
       */
      whileSubscribed?: (
        params: P,
        notify: () => void,
      ) => StopFn | Promise<StopFn>;
    }
  : {
      /**
       * Start something for as long as a tuple has a subscriber (a memo's
       * lifetime); return what stops it. No `notify`: a db value is driven by
       * the change feed alone.
       */
      whileSubscribed?: (params: P) => StopFn | Promise<StopFn>;
    };

/**
 * The options every served value takes, over `S` — the SUBJECT its hooks are
 * handed: the params tuple of a plain value, the decoded question of a
 * typed-query or paged one — and `L`, its loader.
 */
type ServeOptionsBase<
  T,
  S,
  Src extends LiveValueSource,
  R extends readonly ExternalServed[],
  L,
> = {
  /** Where the value's truth lives (see the header). Required. */
  source: Src;
  /** Read the value for one tuple. Parsed against the declaration's schema. */
  loader: L;
  /**
   * Flush this value at most once per window (ms): the first change arms a
   * trailing timer that later changes do not re-arm, so a burst (a rebase
   * rewriting a ref) costs one recompute. A flush already happening for
   * another resource drains it early.
   */
  throttleMs?: number;
  /**
   * Upstream served values whose change recomputes this one — see
   * {@link RecomputeEntry}.
   */
  recomputeOn?: RecomputeOn<R, S>;
} & BoundArm<Src, T> &
  WhileSubscribedArm<Src, S>;

export type ServeValueOptions<
  T,
  P,
  Src extends LiveValueSource,
  R extends readonly ExternalServed[] = [],
> = ServeOptionsBase<T, P, Src, R, (params: P) => Promise<T> | T> & {
  /**
   * Conditional-revalidation signature (an ETag): a cheap over-approximation
   * of "did the value change?" the read path compares before running the
   * loader. Read path only.
   */
  revalidate?: (params: P) => Promise<string>;
};

/**
 * A paged value's options: external only (a paged Postgres list is a
 * `liveCollection`), its loader asked one page of a question. Every hook
 * takes the question `Q`: `whileSubscribed` runs per PAGE tuple (each loaded
 * page is its own subscription), and `notify(query)` reaches every subscribed
 * page of it.
 */
export type ServePagedValueOptions<
  Item,
  Meta,
  Q,
  R extends readonly ExternalServed[] = [],
> = ServeOptionsBase<
  LivePage<Item, Meta>,
  Q,
  "external",
  R,
  (
    query: Q,
    page: LivePageRequest,
  ) => Promise<LivePage<Item, Meta>> | LivePage<Item, Meta>
> & { revalidate?: never };

/**
 * A value's two-arg runtime options: never routed (`reach`) — a value's
 * loader is opaque, so the read-set it captures routes it (`source: "db"`), or
 * its own `notify` does (`"external"`).
 */
type ValueOptions<T, P extends Record<string, string>> = ServerResourceOptions<
  T,
  P
> & { reach?: never };

/** The runtime's two-arg options for a value, plus which factory registers it. */
export interface CompiledValue<T, P extends Record<string, string>, S = P> {
  options: ValueOptions<T, P>;
  external: boolean;
  unbounded?: { reason: string };
  /**
   * The wire tuples a change to `subject` recomputes: the params themselves
   * for a plain value, the one `{ q }` of a typed-query value, every
   * currently-subscribed page of a paged one. What `notify(subject)` and a
   * mapped `recomputeOn` reach.
   */
  tuplesOf(subject: S): P[];
  /**
   * Hand the compiled `whileSubscribed` the registered resource's `notify` (the
   * external arm's second argument). Called once, right after registration; a
   * start that runs before it throws.
   */
  bindNotify(notify: (params: P) => void): void;
}

/** A runtime's two register primitives — server-core's or central-core's. */
export interface ValueRuntime {
  defineResource<T, P extends Record<string, string>>(
    contract: ResourceContract<T, P> & { keyed?: never },
    opts: ValueOptions<T, P>,
  ): Resource<T, P>;
  defineExternalResource<T, P extends Record<string, string>>(
    contract: ResourceContract<T, P> & { keyed?: never },
    opts: ValueOptions<T, P>,
  ): ExternalResource<T, P>;
}

/** A canonical per-tuple key (sorted entries), for the lifecycle pairing. */
function tupleKey(params: Record<string, string>): string {
  return JSON.stringify(
    Object.keys(params)
      .sort()
      .map((k) => [k, params[k]]),
  );
}

/** A tuple's start, as the stop side sees it: its stop, or a start that failed. */
type Started = { ok: true; stop: StopFn } | { ok: false };

/**
 * Pair `whileSubscribed` onto the runtime's 0→1 / N→0 hooks. One record per
 * tuple, set synchronously by the start (so an unsubscribe can never find it
 * missing while the start is still resolving) and taken by the stop:
 *
 * - a sync start is stopped directly;
 * - an async start is RETURNED to the runtime (which awaits it before the
 *   first read, and reports a rejection), and a stop arriving first chains
 *   after it — so a watcher is never left running for a tuple nobody holds;
 * - a start that failed has nothing to stop (its error was reported on the
 *   subscribe path).
 *
 * A re-subscribe during a pending stop gets its own record: the old start's
 * stop still runs, independently.
 */
function pairLifecycle<P extends Record<string, string>>(
  whileSubscribed: (params: P) => StopFn | Promise<StopFn>,
): {
  onFirstSubscribe: (params: P) => void | Promise<void>;
  onLastUnsubscribe: (params: P) => void;
} {
  const running = new Map<string, StopFn | Promise<Started>>();
  return {
    onFirstSubscribe(params) {
      const started = whileSubscribed(params);
      if (!(started instanceof Promise)) {
        running.set(tupleKey(params), started);
        return;
      }
      running.set(
        tupleKey(params),
        started.then(
          (stop): Started => ({ ok: true, stop }),
          // The runtime reports this rejection (the promise below is its own).
          (): Started => ({ ok: false }),
        ),
      );
      return started.then(() => undefined);
    },
    onLastUnsubscribe(params) {
      const key = tupleKey(params);
      const record = running.get(key);
      running.delete(key);
      if (record === undefined) return;
      if (!(record instanceof Promise)) {
        record();
        return;
      }
      void record.then((started) => {
        if (started.ok) started.stop();
      });
    },
  };
}

/**
 * How a value's wire tuples map to the subject its hooks are handed, per
 * declaration form: a plain value's subject IS its params; a typed-query
 * value's is the decoded question (one tuple per question); a paged value's is
 * the decoded question too, but one question has many page tuples — the ones
 * subscribed right now are tracked here, from the runtime's own 0→1 / N→0
 * hooks, so `notify(question)` reaches every page a tab holds.
 */
interface Subjects<P extends Record<string, string>, S> {
  of(params: P): S;
  tuplesOf(subject: S): P[];
  /** Runs on each tuple's first subscriber / last unsubscribe (a paged value's tracking). */
  track?: { add(params: P): void; remove(params: P): void };
}

function subjectsOf<P extends Record<string, string>, S>(
  value: LiveValue<unknown, P, LiveValueOrigin>,
): Subjects<P, S> {
  const decl = value as unknown as
    | { query?: undefined }
    | LiveQueryValue<unknown, unknown, unknown, LiveValueOrigin>
    | LivePagedValue<unknown, unknown, unknown, unknown, LiveValueOrigin>;
  if (decl.query === undefined) {
    return {
      of: (params) => params as unknown as S,
      tuplesOf: (s) => [s as unknown as P],
    };
  }
  if (decl.paged === undefined) {
    const codec = decl.query;
    return {
      of: (params) => codec.decode(params) as S,
      tuplesOf: (s) => [codec.encode(s) as unknown as P],
    };
  }
  const codec = decl.query;
  // q → (tuple key → tuple), for the pages subscribed now.
  const pages = new Map<string, Map<string, P>>();
  return {
    of: (params) => codec.decode(params).query as S,
    // The question's output re-encodes to its own `q`: a query value's schema
    // must parse idempotently, or no tuple of it passes the gate.
    tuplesOf: (s) => [
      ...(pages.get(codec.encodeQuery(s)) ?? new Map()).values(),
    ],
    track: {
      add(params) {
        const q = (params as unknown as LivePageParams).q;
        let tuples = pages.get(q);
        if (tuples === undefined) pages.set(q, (tuples = new Map()));
        tuples.set(tupleKey(params), params);
      },
      remove(params) {
        const q = (params as unknown as LivePageParams).q;
        const tuples = pages.get(q);
        tuples?.delete(tupleKey(params));
        if (tuples?.size === 0) pages.delete(q);
      },
    },
  };
}

/**
 * The runtime loader for one value form: a plain loader is handed the params;
 * a typed-query one the decoded question; a paged one the decoded question and
 * the page asked — and its page is checked against the tuple (at most `n`
 * items, a cursor the next tuple can carry), so an over-long page fails loudly
 * here rather than as a client that pages wrong.
 */
function loaderOf<T, P extends Record<string, string>>(
  value: LiveValue<T, P, LiveValueOrigin>,
  loader: (...args: never[]) => unknown,
): (params: P) => Promise<T> | T {
  const decl = value as unknown as
    | { query?: undefined }
    | LiveQueryValue<unknown, unknown, unknown, LiveValueOrigin>
    | LivePagedValue<unknown, unknown, unknown, unknown, LiveValueOrigin>;
  const call = loader as unknown as (...args: unknown[]) => Promise<T> | T;
  if (decl.query === undefined) return (params) => call(params);
  if (decl.paged === undefined) {
    const codec = decl.query;
    return (params) => call(codec.decode(params));
  }
  const codec = decl.query;
  return async (params) => {
    const { query, cursor, limit } = codec.decode(params);
    const page = (await call(query, { cursor, limit })) as LivePage<
      unknown,
      unknown
    >;
    if (page.items.length > limit) {
      throw new Error(
        `serveValue("${value.key}"): the loader returned ${page.items.length} ` +
          `items for a page of at most ${limit}.`,
      );
    }
    if (page.nextCursor !== null && !isLivePageCursor(page.nextCursor)) {
      throw new Error(
        `serveValue("${value.key}"): nextCursor ${JSON.stringify(page.nextCursor)} ` +
          `is empty or over LIVE_PAGE_CURSOR_MAX_BYTES — the next page's tuple ` +
          `could not carry it.`,
      );
    }
    return page as T;
  };
}

/**
 * Derive the runtime options for a value without registering it — so a test
 * can register them on its own `createResourceRuntime` (the
 * `compileCollection` pattern; `registerValue` does both). A typed-query value
 * is `compileQueryValue` (its options over the decoded question), a paged one
 * `compilePagedValue` — one function per form rather than overloads, so a
 * wrong option is reported on its own property, not as "no overload matches".
 */
export function compileValue<
  T,
  P extends Record<string, string>,
  Src extends LiveValueSource,
  O extends LiveValueOrigin,
  const R extends readonly ExternalServed[] = [],
>(
  value: LivePlainValue<T, P, O>,
  // `NoInfer`: `T` / `P` come from the declaration alone — a loader returning
  // `{}` must not widen `T` past the bound rule.
  opts: ServeValueOptions<NoInfer<T>, NoInfer<P>, Src, R>,
): CompiledValue<T, P> {
  return compileValueOf<T, P, P>(value, opts as AnyServeOptions);
}

/** {@link compileValue} for a typed-query value: every hook takes the decoded question `Q`. */
export function compileQueryValue<
  T,
  Q,
  QIn,
  Src extends LiveValueSource,
  O extends LiveValueOrigin,
  const R extends readonly ExternalServed[] = [],
>(
  value: LiveQueryValue<T, Q, QIn, O>,
  opts: ServeValueOptions<NoInfer<T>, NoInfer<Q>, Src, R>,
): CompiledValue<T, LiveQueryParams, Q> {
  return compileValueOf<T, LiveQueryParams, Q>(value, opts as AnyServeOptions);
}

/** {@link compileValue} for a paged value: external only, its loader asked one page. */
export function compilePagedValue<
  Item,
  Meta,
  Q,
  QIn,
  O extends LiveValueOrigin,
  const R extends readonly ExternalServed[] = [],
>(
  value: LivePagedValue<Item, Meta, Q, QIn, O>,
  opts: ServePagedValueOptions<NoInfer<Item>, NoInfer<Meta>, NoInfer<Q>, R>,
): CompiledValue<LivePage<Item, Meta>, LivePageParams, Q> {
  return compileValueOf<LivePage<Item, Meta>, LivePageParams, Q>(
    value,
    opts as AnyServeOptions,
  );
}

/**
 * The one compilation behind every form, erased: the declaration says which
 * form it is (`query`, `paged`), and the typed entry points above have
 * already checked the options against it.
 */
export function compileValueOf<T, P extends Record<string, string>, S>(
  value: LiveValue<T, P, LiveValueOrigin>,
  opts: AnyServeOptions,
): CompiledValue<T, P, S> {
  const unbounded = (opts as { unbounded?: { reason: string } }).unbounded;
  if (unbounded !== undefined && unbounded.reason.trim() === "") {
    throw new Error(
      `serveValue("${value.key}"): \`unbounded.reason\` is empty — say why this ` +
        `value is not a liveCollection.`,
    );
  }
  const external = opts.source === "external";
  const paged = (value as { paged?: unknown }).paged !== undefined;
  if (paged && !external) {
    // Unreachable from typed code (a paged value's options are external only).
    throw new Error(
      `serveValue("${value.key}"): a paged value is served \`source: "external"\` — ` +
        `a paged Postgres list is a liveCollection.`,
    );
  }
  const subjects = subjectsOf<P, S>(value);

  let notify: ((params: P) => void) | undefined;
  const notifyFor = (params: P) => () => {
    if (notify === undefined) {
      throw new Error(
        `serveValue("${value.key}"): notify used before the value was registered.`,
      );
    }
    notify(params);
  };
  const whileSubscribed = opts.whileSubscribed as
    ((subject: S, notify: () => void) => StopFn | Promise<StopFn>) | undefined;
  const paired =
    whileSubscribed === undefined
      ? undefined
      : pairLifecycle<P>((params) =>
          // The db arm's hook takes the subject only; the extra argument is
          // never passed to it.
          external
            ? whileSubscribed(subjects.of(params), notifyFor(params))
            : (whileSubscribed as (subject: S) => StopFn | Promise<StopFn>)(
                subjects.of(params),
              ),
        );
  const track = subjects.track;
  const lifecycle =
    track === undefined
      ? (paired ?? {})
      : {
          onFirstSubscribe(params: P) {
            track.add(params);
            return paired?.onFirstSubscribe(params);
          },
          onLastUnsubscribe(params: P) {
            track.remove(params);
            paired?.onLastUnsubscribe(params);
          },
        };

  const dependsOn = compileRecomputeOn<P, S>(
    value,
    (opts.recomputeOn ?? []) as readonly RecomputeEntry<ExternalServed, S>[],
    subjects,
  );

  const loader = loaderOf(value, opts.loader as (...args: never[]) => unknown);
  const revalidate = opts.revalidate as
    ((subject: S) => Promise<string>) | undefined;
  return {
    options: {
      // Read off the DECLARATION (`liveValue`'s `load`), never a serve option:
      // the client reads the same field, so the two halves cannot disagree.
      // The runtime's own `"invalidate"` is the named opt-in's spelling.
      mode: value.load === "on-demand" ? "invalidate" : "push",
      // Only the params: the runtime's scoped-refill `ctx` is a keyed concept.
      loader: (params: P) => loader(params),
      ...(opts.throttleMs !== undefined ? { debounceMs: opts.throttleMs } : {}),
      ...(dependsOn.length > 0 ? { dependsOn } : {}),
      ...(revalidate === undefined
        ? {}
        : (value as { query?: unknown }).query === undefined
          ? {
              revalidate: revalidate as unknown as (
                params: P,
              ) => Promise<string>,
            }
          : { revalidate: (params: P) => revalidate(subjects.of(params)) }),
      ...lifecycle,
    },
    external,
    ...(unbounded !== undefined ? { unbounded } : {}),
    tuplesOf: (subject) => subjects.tuplesOf(subject),
    bindNotify(fn) {
      notify = fn;
    },
  };
}

/** The options of any form, erased — the implementation signatures' view. */
export interface AnyServeOptions {
  source: LiveValueSource;
  loader: unknown;
  throttleMs?: number;
  recomputeOn?: readonly unknown[];
  revalidate?: unknown;
  whileSubscribed?: unknown;
  unbounded?: { reason: string };
}

/**
 * `recomputeOn` → `dependsOn`. A bare upstream recomputes every subscribed
 * tuple — except on a param-less value, whose one tuple `{}` is recomputed
 * whether or not a tab holds it right now: an L2-persisted value, or one a
 * downstream maps, must follow its upstream with no subscriber. (A tab's old
 * copy needs no recompute to be refused: the runtime opens every subscription
 * span with a fresh version.) A mapped entry names a SUBJECT (a question, for a
 * query value), recomputing the tuples it reaches.
 */
function compileRecomputeOn<P extends Record<string, string>, S>(
  value: { key: string; params: readonly string[] },
  entries: readonly RecomputeEntry<ExternalServed, S>[],
  subjects: Subjects<P, S>,
): DependsOnEntry<P>[] {
  return entries.map((entry): DependsOnEntry<P> => {
    if ("value" in entry) {
      const toSubject = entry.params;
      return {
        resource: entry.value,
        map: (upstreamParams: unknown) =>
          subjects.tuplesOf(
            toSubject(upstreamParams as UpstreamParams<ExternalServed>),
          ),
      };
    }
    const upstream = entry as ExternalServed;
    if (value.params.length === 0) {
      return { resource: upstream, map: () => [{} as P] };
    }
    return { resource: upstream, toSubscribed: true };
  });
}

/**
 * Compile and register a value on `runtime`, and bind its `notify` into the
 * lifecycle. Returns the runtime resource (external ⇒ with `notify`).
 */
export function registerValue<
  T,
  P extends Record<string, string>,
  O extends LiveValueOrigin,
  Src extends LiveValueSource,
  const R extends readonly ExternalServed[] = [],
>(
  runtime: ValueRuntime,
  value: LivePlainValue<T, P, O>,
  opts: ServeValueOptions<NoInfer<T>, NoInfer<P>, Src, R>,
): Registered<T, P> {
  return registerValueOf<T, P, P>(runtime, value, opts as AnyServeOptions);
}

/** {@link registerValue} for a typed-query value (see {@link compileQueryValue}). */
export function registerQueryValue<
  T,
  Q,
  QIn,
  O extends LiveValueOrigin,
  Src extends LiveValueSource,
  const R extends readonly ExternalServed[] = [],
>(
  runtime: ValueRuntime,
  value: LiveQueryValue<T, Q, QIn, O>,
  opts: ServeValueOptions<NoInfer<T>, NoInfer<Q>, Src, R>,
): Registered<T, LiveQueryParams, Q> {
  return registerValueOf<T, LiveQueryParams, Q>(
    runtime,
    value,
    opts as AnyServeOptions,
  );
}

/** {@link registerValue} for a paged value (see {@link compilePagedValue}). */
export function registerPagedValue<
  Item,
  Meta,
  Q,
  QIn,
  O extends LiveValueOrigin,
  const R extends readonly ExternalServed[] = [],
>(
  runtime: ValueRuntime,
  value: LivePagedValue<Item, Meta, Q, QIn, O>,
  opts: ServePagedValueOptions<NoInfer<Item>, NoInfer<Meta>, NoInfer<Q>, R>,
): Registered<LivePage<Item, Meta>, LivePageParams, Q> {
  return registerValueOf<LivePage<Item, Meta>, LivePageParams, Q>(
    runtime,
    value,
    opts as AnyServeOptions,
  );
}

/** The registration behind every form, erased (see {@link compileValueOf}). */
export function registerValueOf<T, P extends Record<string, string>, S>(
  runtime: ValueRuntime,
  value: LiveValue<T, P, LiveValueOrigin>,
  opts: AnyServeOptions,
): Registered<T, P, S> {
  const compiled = compileValueOf<T, P, S>(value, opts);
  // A `LiveValue` is structurally a non-keyed `ResourceContract` (`keyed?: never`).
  const contract = value as ResourceContract<T, P> & { keyed?: never };
  if (compiled.external) {
    const resource = runtime.defineExternalResource(contract, compiled.options);
    compiled.bindNotify((params) => resource.notify(params));
    return { resource, compiled };
  }
  const resource = runtime.defineResource(contract, compiled.options);
  return { resource, compiled };
}

/** What `registerValue` returns: the runtime resource and its compiled options. */
export interface Registered<T, P extends Record<string, string>, S = P> {
  resource: Resource<T, P> | ExternalResource<T, P>;
  compiled: CompiledValue<T, P, S>;
}
