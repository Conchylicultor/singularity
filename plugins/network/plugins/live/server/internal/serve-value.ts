import {
  defineExternalResource,
  defineResource,
  Resource as ResourceContribution,
} from "@plugins/framework/plugins/server-core/core";
import type { LiveValue } from "@plugins/network/plugins/live/core";
import {
  registerValue,
  type LiveValueSource,
  type ServedValueBase,
  type ServeValueOptions,
} from "../../shared/compile-value";

// `serveValue` — the server half of a worktree `liveValue`. It declares WHERE the
// value's truth lives (`source`) and how to read it (`loader`), never a delivery
// mode: a value is pushed whole whenever it changes. Loading on demand is the
// one named opt-in, for a loader too slow for the shared flush cycle.
//
// - `source: "db"` — the truth is Postgres. The read-set is captured at the DB
//   pool chokepoint, and a change to any table the loader read recomputes every
//   subscribed tuple (a FULL recompute — no scope policy: a value is one
//   payload, a keyed payload is a collection). There is no `notify`.
// - `source: "external"` — the truth lives outside Postgres (git, files, an
//   in-memory registry), which no change feed can see: the served value has
//   `notify(params?)`, and nothing else does.
//
// The options (`throttleMs`, `recomputeOn`, `whileSubscribed`, `revalidate`, …)
// compile in `../../shared/compile-value`, shared with the central `serveValue`.

/** A served value: the runtime resource, its key, and its one `Resource.Declare`. */
export type ServedValue<T, P extends Record<string, string>> = ServedValueBase<
  T,
  P
> & {
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

// biome-ignore lint/suspicious/noExplicitAny: an upstream of any payload/params.
type AnyServed = ServedValueBase<any, any>;

/**
 * Serve a worktree `liveValue` (a central one is served by
 * `network/live/central`'s `serveValue` — passing it here is a tsc error).
 *
 * ```ts
 * export const unreadServed = serveValue(notificationsUnread, {
 *   source: "db",
 *   loader: countUnread,
 * });
 * // contributions: [...unreadServed.declare]
 *
 * export const refHeadServed = serveValue(refHead, {
 *   source: "external",
 *   loader: ({ refName }) => readRefHead(refName),
 *   throttleMs: 300,
 * });
 * refHeadServed.notify({ refName });
 * ```
 */
export function serveValue<
  T,
  P extends Record<string, string>,
  const R extends readonly AnyServed[] = [],
>(
  value: LiveValue<T, P>,
  opts: ServeValueOptions<NoInfer<T>, NoInfer<P>, "db", R>,
): ServedValue<T, P>;
export function serveValue<
  T,
  P extends Record<string, string>,
  const R extends readonly AnyServed[] = [],
>(
  value: LiveValue<T, P>,
  opts: ServeValueOptions<NoInfer<T>, NoInfer<P>, "external", R>,
): ServedExternalValue<T, P>;
export function serveValue<T, P extends Record<string, string>>(
  value: LiveValue<T, P>,
  opts: ServeValueOptions<T, P, LiveValueSource, readonly AnyServed[]>,
): ServedValue<T, P> | ServedExternalValue<T, P> {
  const { resource, compiled } = registerValue(
    { defineResource, defineExternalResource },
    value,
    opts,
  );
  const base = {
    key: resource.key,
    mode: resource.mode,
    schema: resource.schema,
    ...(resource.preload !== undefined ? { preload: resource.preload } : {}),
    load: (params: P) => resource.load(params),
    source: opts.source,
    ...(compiled.unbounded !== undefined
      ? { unbounded: compiled.unbounded }
      : {}),
    keys: [value.key],
    declare: [ResourceContribution.Declare(resource)] as [
      ReturnType<typeof ResourceContribution.Declare>,
    ],
  };
  if ("notify" in resource && compiled.external) {
    const served: ServedExternalValue<T, P> = {
      ...base,
      // Only the params: `affectedIds` is a keyed concept.
      notify: (params?: P) => resource.notify(params),
    };
    return served;
  }
  // A fresh object rather than the runtime's own: that one carries a working
  // `notify` its type merely hides, and a Postgres-backed value is driven by the
  // change feed alone — so the db arm has no `notify`, at runtime too.
  const served: ServedValue<T, P> = base;
  return served;
}
