import type {
  DependsOnEntry,
  ExternalResource,
  Resource,
  ResourceContract,
  ServerResourceOptions,
} from "@plugins/framework/plugins/resource-runtime/core";
import type {
  LiveValue,
  LiveValueOrigin,
} from "@plugins/network/plugins/live/core";

// The option compilation behind BOTH `serveValue`s — the worktree one
// (`network/live/server`, on server-core's runtime) and the central one
// (`network/live/central`, on central-core's). It lives here, once, so the two
// barrels cannot drift: each only injects its runtime's two register
// primitives and shapes the served object its plugin definition takes.
//
// A value declares WHERE its truth lives (`source`) and how to read it
// (`loader`), never a delivery mode: it is pushed whole whenever it changes.
// Everything else is one named option, each folded into the runtime's own
// two-arg `defineResource` / `defineExternalResource`:
//
// - `throttleMs`        → the runtime's `debounceMs` (a fixed trailing window,
//                         not re-armed — a throttle, whatever the old name said).
// - `recomputeOn`       → `dependsOn` edges. A bare served value recomputes
//                         every currently-subscribed tuple of THIS value (the
//                         runtime's `toSubscribed` edge; a param-less value
//                         always recomputes its one `{}` tuple). The mapped form
//                         `{ value, params }` is a plain per-tuple edge.
// - `whileSubscribed`   → the runtime's `onFirstSubscribe` / `onLastUnsubscribe`
//                         pair, owned here so a start without a stop cannot be
//                         written (see `pairLifecycle`).
// - `revalidate`        → passed through.

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

// `any`: an upstream of any payload/params — `Resource` is invariant in both.
// biome-ignore lint/suspicious/noExplicitAny: see above.
type AnyServed = ServedValueBase<any, any>;

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
export type RecomputeOn<R extends readonly AnyServed[], P> = {
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

export type ServeValueOptions<
  T,
  P extends Record<string, string>,
  Src extends LiveValueSource,
  R extends readonly AnyServed[] = [],
> = {
  /** Where the value's truth lives (see the header). Required. */
  source: Src;
  /** Read the value for one params tuple. Parsed against the declaration's schema. */
  loader: (params: P) => Promise<T> | T;
  /**
   * `"push"` (the default): the server recomputes a changed value and pushes it.
   * `"on-demand"`: the server skips the loader in the shared flush and each
   * subscribed tab refetches over HTTP — for a slow loader kept out of the
   * flush cycle.
   */
  load?: "push" | "on-demand";
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
  recomputeOn?: RecomputeOn<R, P>;
  /**
   * Conditional-revalidation signature (an ETag): a cheap over-approximation
   * of "did the value change?" the read path compares before running the
   * loader. Read path only.
   */
  revalidate?: (params: P) => Promise<string>;
} & BoundArm<Src, T> &
  WhileSubscribedArm<Src, P>;

/** The runtime's two-arg options for a value, plus which factory registers it. */
export interface CompiledValue<T, P extends Record<string, string>> {
  options: ServerResourceOptions<T, P> & { mode: "push" | "invalidate" };
  external: boolean;
  unbounded?: { reason: string };
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
    opts: ServerResourceOptions<T, P>,
  ): Resource<T, P>;
  defineExternalResource<T, P extends Record<string, string>>(
    contract: ResourceContract<T, P>,
    opts: ServerResourceOptions<T, P>,
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
 * Derive the runtime options for a value without registering it — so a test
 * can register them on its own `createResourceRuntime` (the
 * `compileCollection` pattern; `registerValue` does both).
 */
export function compileValue<
  T,
  P extends Record<string, string>,
  Src extends LiveValueSource,
  O extends LiveValueOrigin,
  const R extends readonly AnyServed[] = [],
>(
  value: LiveValue<T, P, O>,
  // `NoInfer`: `T` / `P` come from the declaration alone — a loader returning
  // `{}` must not widen `T` past the bound rule.
  opts: ServeValueOptions<NoInfer<T>, NoInfer<P>, Src, R>,
): CompiledValue<T, P> {
  const unbounded = (opts as { unbounded?: { reason: string } }).unbounded;
  if (unbounded !== undefined && unbounded.reason.trim() === "") {
    throw new Error(
      `serveValue("${value.key}"): \`unbounded.reason\` is empty — say why this ` +
        `value is not a liveCollection.`,
    );
  }
  const external = opts.source === "external";

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
    ((params: P, notify: () => void) => StopFn | Promise<StopFn>) | undefined;
  const lifecycle =
    whileSubscribed === undefined
      ? {}
      : pairLifecycle<P>((params) =>
          // The db arm's hook takes the params only; the extra argument is
          // never passed to it.
          external
            ? whileSubscribed(params, notifyFor(params))
            : (whileSubscribed as (params: P) => StopFn | Promise<StopFn>)(
                params,
              ),
        );

  const dependsOn = compileRecomputeOn<P>(
    value,
    (opts.recomputeOn ?? []) as readonly RecomputeEntry<AnyServed, P>[],
  );

  const loader = opts.loader;
  return {
    options: {
      // The runtime's own `"invalidate"` is the named opt-in's spelling.
      mode: opts.load === "on-demand" ? "invalidate" : "push",
      // Only the params: the runtime's scoped-refill `ctx` is a keyed concept.
      loader: (params: P) => loader(params),
      ...(opts.throttleMs !== undefined ? { debounceMs: opts.throttleMs } : {}),
      ...(dependsOn.length > 0 ? { dependsOn } : {}),
      ...(opts.revalidate !== undefined ? { revalidate: opts.revalidate } : {}),
      ...lifecycle,
    },
    external,
    ...(unbounded !== undefined ? { unbounded } : {}),
    bindNotify(fn) {
      notify = fn;
    },
  };
}

/**
 * `recomputeOn` → `dependsOn`. A bare upstream recomputes every subscribed
 * tuple — except on a param-less value, whose one tuple `{}` is recomputed
 * whether or not a tab holds it right now: a recompute is also what advances
 * its version, and a later subscriber must not be told its old copy is current.
 */
function compileRecomputeOn<P extends Record<string, string>>(
  value: { key: string; params: readonly string[] },
  entries: readonly RecomputeEntry<AnyServed, P>[],
): DependsOnEntry<P>[] {
  return entries.map((entry): DependsOnEntry<P> => {
    if ("value" in entry) {
      const toParams = entry.params;
      return {
        resource: entry.value,
        map: (upstreamParams: unknown) => [
          toParams(upstreamParams as UpstreamParams<AnyServed>),
        ],
      };
    }
    const upstream = entry as AnyServed;
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
  const R extends readonly AnyServed[] = [],
>(
  runtime: ValueRuntime,
  value: LiveValue<T, P, O>,
  opts: ServeValueOptions<NoInfer<T>, NoInfer<P>, Src, R>,
): {
  resource: Resource<T, P> | ExternalResource<T, P>;
  compiled: CompiledValue<T, P>;
} {
  const compiled = compileValue(value, opts);
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
