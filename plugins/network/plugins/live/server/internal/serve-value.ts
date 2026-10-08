import {
  defineExternalResource,
  defineResource,
  Resource as ResourceContribution,
} from "@plugins/framework/plugins/server-core/core";
import type {
  LivePreloadedParamValue,
  LiveValue,
} from "@plugins/network/plugins/live/core";
import { canonicalParams } from "@plugins/packages/plugins/canonical-params/core";
import {
  registerValue,
  type ExternalServed,
  type LiveValueSource,
  type ServedValueBase,
  type ServeValueOptions,
} from "../../shared/compile-value";

// `serveValue` — the server half of a worktree `liveValue`. It declares WHERE the
// value's truth lives (`source`) and how to read it (`loader`), never a delivery
// mode: a value is pushed whole whenever it changes, unless its `liveValue`
// declaration opts into `load: "on-demand"` (declared there because the client
// reads it too).
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

/** Any other worktree value: its `serveValue` takes no `preloadParams`. */
type PlainValue<T, P extends Record<string, string>> = LiveValue<T, P> & {
  preloadsParams?: never;
};

/**
 * The tuples a parameterized preloaded value hydrates at boot. It has no
 * default tuple, so the server names them: the boot snapshot loads each one
 * (the loader stays the only source of the value) and the client hydrates it
 * before first paint. Enumerate exactly what first paint reads — every tuple is
 * loaded on every page load.
 */
interface PreloadParamsOption<P> {
  preloadParams: () => P[] | Promise<P[]>;
}

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
  const R extends readonly ExternalServed[] = [],
>(
  value: LivePreloadedParamValue<T, P>,
  opts: ServeValueOptions<NoInfer<T>, NoInfer<P>, "db", R> &
    PreloadParamsOption<NoInfer<P>>,
): ServedValue<T, P>;
export function serveValue<
  T,
  P extends Record<string, string>,
  const R extends readonly ExternalServed[] = [],
>(
  value: LivePreloadedParamValue<T, P>,
  opts: ServeValueOptions<NoInfer<T>, NoInfer<P>, "external", R> &
    PreloadParamsOption<NoInfer<P>>,
): ServedExternalValue<T, P>;
export function serveValue<
  T,
  P extends Record<string, string>,
  const R extends readonly ExternalServed[] = [],
>(
  value: PlainValue<T, P>,
  opts: ServeValueOptions<NoInfer<T>, NoInfer<P>, "db", R> & {
    preloadParams?: never;
  },
): ServedValue<T, P>;
export function serveValue<
  T,
  P extends Record<string, string>,
  const R extends readonly ExternalServed[] = [],
>(
  value: PlainValue<T, P>,
  opts: ServeValueOptions<NoInfer<T>, NoInfer<P>, "external", R> & {
    preloadParams?: never;
  },
): ServedExternalValue<T, P>;
export function serveValue<T, P extends Record<string, string>>(
  value: LiveValue<T, P> & { preloadsParams?: true },
  opts: ServeValueOptions<T, P, LiveValueSource, readonly ExternalServed[]> & {
    preloadParams?: () => P[] | Promise<P[]>;
  },
): ServedValue<T, P> | ServedExternalValue<T, P> {
  // The pairing tsc enforces, for an untyped caller: a param'd preloaded value
  // names its boot tuples, and nothing else may.
  if ((value.preloadsParams === true) !== (opts.preloadParams !== undefined)) {
    throw new Error(
      value.preloadsParams === true
        ? `serveValue("${value.key}"): a parameterized value declared \`preload\` ` +
            `must pass \`preloadParams\` — the boot snapshot has no default tuple ` +
            `to load for it.`
        : `serveValue("${value.key}"): \`preloadParams\` is only for a ` +
            `parameterized value declared \`preload\`.`,
    );
  }
  const { resource, compiled } = registerValue(
    { defineResource, defineExternalResource },
    value,
    opts,
  );
  const enumerate = opts.preloadParams;
  const optional = value.optionalParams;
  // The boot snapshot's read of an enumerated preload. Each tuple is canonical
  // (the tuple a read subscribes — `canonicalParams`) and is loaded through the
  // resource's own `load` (the loader + schema parse), sequentially and settled
  // on its own. Deliberately NOT the runtime's flight path: that captures a
  // commit watermark (one DB query) per load, a floor nothing reads for a value
  // that is only hydrated.
  const preloadTuples =
    enumerate === undefined
      ? undefined
      : async () => {
          const out: (
            | { params: P; ok: true; value: unknown }
            | { params: P; ok: false; error: unknown }
          )[] = [];
          for (const raw of await enumerate()) {
            const params = canonicalParams(raw, optional);
            try {
              out.push({
                params,
                ok: true,
                value: await resource.load(params),
              });
            } catch (error) {
              out.push({ params, ok: false, error });
            }
          }
          return out;
        };
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
    declare: [
      ResourceContribution.Declare({
        key: resource.key,
        mode: resource.mode,
        ...(resource.preload !== undefined
          ? { preload: resource.preload }
          : {}),
        ...(preloadTuples !== undefined ? { preloadTuples } : {}),
      }),
    ] as [ReturnType<typeof ResourceContribution.Declare>],
  };
  if ("notify" in resource && compiled.external) {
    const served: ServedExternalValue<T, P> = {
      ...base,
      // Only the params: `affectedIds` is a keyed concept. The runtime
      // canonicalizes them, so a notify reaches the tuple a read subscribed
      // however an absent optional param is spelled (`undefined`, `""`, left out).
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
