import {
  defineExternalResource,
  defineResource,
} from "@plugins/framework/plugins/central-core/core";
import type { LiveValue } from "@plugins/network/plugins/live/core";
import {
  registerValue,
  type ServedValueBase,
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

// biome-ignore lint/suspicious/noExplicitAny: an upstream of any payload/params.
type AnyServed = ServedValueBase<any, any>;

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
  T,
  P extends Record<string, string>,
  const R extends readonly AnyServed[] = [],
>(
  value: LiveValue<T, P, "central">,
  opts: ServeValueOptions<NoInfer<T>, NoInfer<P>, "external", R>,
): CentralServedValue<T, P> {
  if ((opts.source as string) !== "external") {
    // Unreachable from typed code: the only arm is external.
    throw new Error(
      `serveValue("${value.key}"): a central value must be source "external" — central has no change feed.`,
    );
  }
  const { resource } = registerValue(
    { defineResource, defineExternalResource },
    value,
    opts as ServeValueOptions<T, P, "external", readonly AnyServed[]>,
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
    // Only the params: `affectedIds` is a keyed concept.
    notify: (params?: P) => resource.notify(params),
  };
}
