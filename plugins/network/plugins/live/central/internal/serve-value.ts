import {
  defineExternalResource,
  defineResource,
} from "@plugins/framework/plugins/central-core/core";
import type {
  LivePage,
  LivePagedValue,
  LivePageParams,
  LiveQueryParams,
  LiveQueryValue,
  LiveValue,
} from "@plugins/network/plugins/live/core";
import {
  registerValueOf,
  type AnyServeOptions,
  type ExternalServed,
  type ServedValueBase,
  type ServePagedValueOptions,
  type ServeValueOptions,
} from "../../shared/compile-value";

// `serveValue` on the CENTRAL runtime — the machine-wide process every worktree
// shares (auth). It takes only a value declared `origin: "central"` (a worktree
// value here is a tsc error, and the reverse), and only the external arm:
// central has no change feed, so its truth is always outside Postgres and the
// served value always has `notify`.
//
// Registration is the central plugin definition's `resources: [served]` — the
// central runtime has no `Resource.Declare` contribution, so there is no
// `declare` tuple here. Options compile in `../../shared/compile-value`, the same
// code the worktree `serveValue` runs.

/** A value served by the central runtime: the runtime resource plus `notify`. */
export type CentralServedValue<
  T,
  P extends Record<string, string>,
> = ServedValueBase<T, P> & {
  source: "external";
  /** The truth changed: recompute (and push) this tuple — `{}` when omitted. */
  notify(params?: P): void;
};

/** A central typed-query or paged value: `notify(query)` reaches its question's tuples. */
export type CentralServedQueryValue<
  T,
  P extends Record<string, string>,
  Q,
> = ServedValueBase<T, P> & {
  source: "external";
  notify(query: Q): void;
};

/**
 * Serve a central `liveValue`.
 *
 * ```ts
 * export const authStateServed = serveValue(authState, {
 *   source: "external",
 *   loader: computeAuthState,
 * });
 * // central plugin definition: resources: [authStateServed]
 * authStateServed.notify();
 * ```
 */
export function serveValue<
  Item,
  Meta,
  Q,
  QIn,
  const R extends readonly ExternalServed[] = [],
>(
  value: LivePagedValue<Item, Meta, Q, QIn, "central">,
  opts: ServePagedValueOptions<NoInfer<Item>, NoInfer<Meta>, NoInfer<Q>, R>,
): CentralServedQueryValue<LivePage<Item, Meta>, LivePageParams, Q>;
export function serveValue<
  T,
  Q,
  QIn,
  const R extends readonly ExternalServed[] = [],
>(
  value: LiveQueryValue<T, Q, QIn, "central">,
  opts: ServeValueOptions<NoInfer<T>, NoInfer<Q>, "external", R>,
): CentralServedQueryValue<T, LiveQueryParams, Q>;
export function serveValue<
  T,
  P extends Record<string, string>,
  const R extends readonly ExternalServed[] = [],
>(
  value: LiveValue<T, P, "central"> & { query?: undefined },
  opts: ServeValueOptions<NoInfer<T>, NoInfer<P>, "external", R>,
): CentralServedValue<T, P>;
export function serveValue<T, P extends Record<string, string>>(
  value: LiveValue<T, P, "central"> & { query?: unknown },
  opts: AnyServeOptions,
): CentralServedValue<T, P> | CentralServedQueryValue<T, P, unknown> {
  if ((opts.source as string) !== "external") {
    // Unreachable from typed code: the only arm is external.
    throw new Error(
      `serveValue("${value.key}"): a central value must be source "external" — central has no change feed.`,
    );
  }
  // Erased: the overloads checked the options against the declaration's
  // form, and the compilation dispatches on the declaration itself.
  const { resource, compiled } = registerValueOf<T, P, unknown>(
    { defineResource, defineExternalResource },
    value,
    opts,
  );
  if (!("notify" in resource)) {
    throw new Error(
      `serveValue("${value.key}"): the external arm registered no notify.`,
    );
  }
  return {
    key: resource.key,
    mode: resource.mode,
    schema: resource.schema,
    ...(resource.preload !== undefined ? { preload: resource.preload } : {}),
    load: (params: P) => resource.load(params),
    source: "external",
    keys: [value.key],
    // Only the params: `affectedIds` is a keyed concept. A query or paged
    // value is notified by its QUESTION (see the worktree `serveValue`).
    notify:
      (value as { query?: unknown }).query !== undefined
        ? (query?: unknown) => {
            for (const tuple of compiled.tuplesOf(query))
              resource.notify(tuple);
          }
        : (params?: P) => resource.notify(params),
  };
}
