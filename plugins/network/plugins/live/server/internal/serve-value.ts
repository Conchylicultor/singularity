import {
  defineExternalResource,
  defineResource,
  Resource as ResourceContribution,
} from "@plugins/framework/plugins/server-core/core";
import type {
  Resource,
  ServerResourceOptions,
} from "@plugins/framework/plugins/resource-runtime/core";
import type { LiveValue } from "@plugins/network/plugins/live/core";

// `serveValue` — the server half of a `liveValue`. It declares WHERE the value's
// truth lives (`source`) and how to read it (`loader`), never a delivery mode:
// a value is pushed whole whenever it changes. Loading on demand is the one
// named opt-in, for a loader too slow for the shared flush cycle.
//
// - `source: "db"` — the truth is Postgres. The read-set is captured at the DB
//   pool chokepoint, and a change to any table the loader read recomputes every
//   subscribed tuple (a FULL recompute — no scope policy: a value is one
//   payload, a keyed payload is a collection). There is no `notify`.
// - `source: "external"` — the truth lives outside Postgres (git, files, an
//   in-memory registry), which no change feed can see: the served value has
//   `notify(params?)`, and nothing else does.
//
// Nothing here is a new runtime path: the options fold into the runtime's own
// two-arg `defineResource` / `defineExternalResource`.

/** Where a value's truth lives — see the header. */
export type LiveValueSource = "db" | "external";

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

export type ServeValueOptions<
  T,
  P extends Record<string, string>,
  Src extends LiveValueSource,
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
} & BoundArm<Src, T>;

/** A served value: the runtime resource, its key, and its one `Resource.Declare`. */
export type ServedValue<T, P extends Record<string, string>> = Resource<
  T,
  P
> & {
  source: LiveValueSource;
  /** The collection-shaped value's recorded reason (db arm only). */
  unbounded?: { reason: string };
  /** `[key]` — symmetric with `ServedCollection.keys`. */
  keys: string[];
  /** Spread into the plugin's `contributions`: `[...served.declare]`. */
  declare: [ReturnType<typeof ResourceContribution.Declare>];
};

/** A served external value: a {@link ServedValue} plus `notify`. */
export type ServedExternalValue<
  T,
  P extends Record<string, string>,
> = ServedValue<T, P> & {
  /** The truth changed: recompute (and push) this tuple — `{}` when omitted. */
  notify(params?: P): void;
};

/** The runtime's two-arg options for a value, plus which factory registers it. */
export interface CompiledValue<T, P extends Record<string, string>> {
  options: ServerResourceOptions<T, P> & { mode: "push" | "invalidate" };
  external: boolean;
  unbounded?: { reason: string };
}

/**
 * Derive the runtime options for a value without registering it — so a test
 * can register them on its own `createResourceRuntime` (the
 * `compileCollection` pattern).
 */
export function compileValue<
  T,
  P extends Record<string, string>,
  Src extends LiveValueSource,
>(
  value: LiveValue<T, P>,
  // `NoInfer`: `T` / `P` come from the declaration alone — a loader returning
  // `{}` must not widen `T` past the bound rule.
  opts: ServeValueOptions<NoInfer<T>, NoInfer<P>, Src>,
): CompiledValue<T, P> {
  const unbounded = (opts as { unbounded?: { reason: string } }).unbounded;
  if (unbounded !== undefined && unbounded.reason.trim() === "") {
    throw new Error(
      `serveValue("${value.key}"): \`unbounded.reason\` is empty — say why this ` +
        `value is not a liveCollection.`,
    );
  }
  const loader = opts.loader;
  return {
    options: {
      // The runtime's own `"invalidate"` is the named opt-in's spelling.
      mode: opts.load === "on-demand" ? "invalidate" : "push",
      // Only the params: the runtime's scoped-refill `ctx` is a keyed concept.
      loader: (params: P) => loader(params),
    },
    external: opts.source === "external",
    ...(unbounded !== undefined ? { unbounded } : {}),
  };
}

/**
 * Serve a `liveValue`.
 *
 * ```ts
 * export const unreadServed = serveValue(notificationsUnread, {
 *   source: "db",
 *   loader: countUnread,
 * });
 * // contributions: [...unreadServed.declare]
 *
 * export const sentinelServed = serveValue(sentinelStatus, {
 *   source: "external",
 *   loader: readStatus,
 * });
 * sentinelServed.notify();
 * ```
 */
export function serveValue<T, P extends Record<string, string>>(
  value: LiveValue<T, P>,
  opts: ServeValueOptions<NoInfer<T>, NoInfer<P>, "db">,
): ServedValue<T, P>;
export function serveValue<T, P extends Record<string, string>>(
  value: LiveValue<T, P>,
  opts: ServeValueOptions<NoInfer<T>, NoInfer<P>, "external">,
): ServedExternalValue<T, P>;
export function serveValue<T, P extends Record<string, string>>(
  value: LiveValue<T, P>,
  opts: ServeValueOptions<T, P, LiveValueSource>,
): ServedValue<T, P> | ServedExternalValue<T, P> {
  const compiled = compileValue(value, opts);
  const base = {
    source: opts.source,
    ...(compiled.unbounded !== undefined
      ? { unbounded: compiled.unbounded }
      : {}),
    keys: [value.key],
  };
  if (compiled.external) {
    const resource = defineExternalResource(value, compiled.options);
    const served: ServedExternalValue<T, P> = {
      key: resource.key,
      mode: resource.mode,
      schema: resource.schema,
      ...(resource.preload !== undefined ? { preload: resource.preload } : {}),
      load: (params: P) => resource.load(params),
      // Only the params: `affectedIds` is a keyed concept.
      notify: (params?: P) => resource.notify(params),
      ...base,
      declare: [ResourceContribution.Declare(resource)],
    };
    return served;
  }
  const resource = defineResource(value, compiled.options);
  // A fresh object rather than the runtime's own: that one carries a working
  // `notify` its type merely hides, and a Postgres-backed value is driven by the
  // change feed alone — so the db arm has no `notify`, at runtime too.
  const served: ServedValue<T, P> = {
    key: resource.key,
    mode: resource.mode,
    schema: resource.schema,
    ...(resource.preload !== undefined ? { preload: resource.preload } : {}),
    load: (params: P) => resource.load(params),
    ...base,
    declare: [ResourceContribution.Declare(resource)],
  };
  return served;
}
