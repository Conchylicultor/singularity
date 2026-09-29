import type { ZodParser } from "@plugins/packages/plugins/zod-parser/core";
import { ResourceContractError } from "@plugins/packages/plugins/resource-protocol/core";
import {
  registerResourceDescriptor,
  type ResourceDescriptor,
  type ResourcePreload,
} from "@plugins/primitives/plugins/live-state/core";
import type { LivePreload } from "./live-collection";

// `liveValue` — the declaration half of a live VALUE: one payload per params
// tuple, pushed whole whenever it changes — or, with `load: "on-demand"`,
// refetched over HTTP by each tab (the server half is `serveValue`, the read is
// `useLive(value, params?)`). The delivery mode is declared HERE, not on
// `serveValue`: the client reads it too, so it lives on the one declaration
// both halves share and they cannot disagree. A value has no rows, no window and no id
// set; anything row-shaped and growing is a `liveCollection`.
//
// Not known yet is a STATE: a value declares no `initial` placeholder. Its read
// is `pending` until the first authoritative value lands — or settled on its
// first render when the boot snapshot preloaded it.

/** A declared param name without its optional marker: `"scopeId?"` → `"scopeId"`. */
type RequiredParamName<N extends string> = N extends `${string}?` ? never : N;
type OptionalParamName<N extends string> = N extends `${infer B}?` ? B : never;

/**
 * The params object a value's declared param names derive: every name → a
 * string, and a name declared with a trailing `?` (`"scopeId?"`) → an optional
 * one. An optional param is present iff it is a non-empty string: the
 * substrate drops an `undefined` or `""` one wherever params enter it
 * (`canonicalParams`), so `{ path }` and `{ path, scopeId: undefined }` name
 * one tuple.
 */
export type LiveValueParams<N extends readonly string[]> = Simplify<
  { [R in RequiredParamName<N[number]>]: string } & {
    [O in OptionalParamName<N[number]>]?: string;
  }
>;

/** One object type out of an intersection (keeps each key's `?`). */
type Simplify<T> = { [K in keyof T]: T[K] };

/**
 * Which process serves a value: a worktree backend (the default), or the
 * machine-wide central runtime (shared by every worktree — auth). The browser
 * picks the socket from the descriptor's `origin`, and each `serveValue` accepts
 * only its own origin (tsc).
 */
export type LiveValueOrigin = "worktree" | "central";

/**
 * The descriptor's `origin` for `O`: required `"central"` on a central value,
 * absent on a worktree one — so neither is assignable to the other.
 */
type OriginField<O extends LiveValueOrigin> = O extends "central"
  ? { origin: "central" }
  : { origin?: never };

/**
 * A declared live value — a `ResourceDescriptor` with no placeholder
 * (`initialData`), discriminated from a collection by `live: "value"`.
 */
export type LiveValue<
  T,
  P extends Record<string, string> = Record<string, never>,
  O extends LiveValueOrigin = "worktree",
> = Omit<
  ResourceDescriptor<T, P>,
  "initialData" | "keyed" | "preload" | "origin" | "load"
> &
  OriginField<O> & {
    live: "value";
    /**
     * The declared param names — `P`'s keys, without the optional marker.
     * Empty for a param-less value. The optional ones are also in
     * `optionalParams`.
     */
    params: readonly (keyof P & string)[];
    /** Absent ⇒ loaded on first mount (the declaration's `"none"`). */
    preload?: ResourcePreload;
    /** Absent ⇒ pushed (the declaration's `"push"`). See {@link LiveValueLoad}. */
    load?: "on-demand";
    /** A value has no placeholder: not known yet is `pending`, never a stand-in. */
    initialData?: never;
    /** A value is pushed whole — never a row-keyed delta. */
    keyed?: never;
  };

/**
 * How a value reaches the tab. `"push"` (the default): the server recomputes a
 * changed value and pushes it. `"on-demand"`: the server skips the loader in
 * the shared flush, sends an `invalidate`, and each subscribed tab refetches
 * over HTTP — for a slow loader kept out of the flush cycle.
 */
export type LiveValueLoad = "push" | "on-demand";

/** A param-less value: may be preloaded. */
export interface LiveValueSpec<T> {
  /** The payload's wire schema — every push and HTTP read parses through it. */
  schema: ZodParser<T>;
  params?: undefined;
  /** Default `"none"` (see {@link LivePreload}). */
  preload?: LivePreload;
  /** Default `"push"` (see {@link LiveValueLoad}). */
  load?: LiveValueLoad;
  /** A worktree value (the default) — see {@link LiveCentralValueSpec}. */
  origin?: undefined;
}

/**
 * A value served by the central runtime (`serveValue` from
 * `network/live/central`). Never preloaded: the boot snapshot is a worktree
 * backend's read, and it cannot load a central key.
 */
export interface LiveCentralValueSpec<T> {
  schema: ZodParser<T>;
  params?: undefined;
  preload?: never;
  /** Default `"push"` (see {@link LiveValueLoad}). */
  load?: LiveValueLoad;
  origin: "central";
}

/**
 * A parameterized value, not preloaded (see {@link LivePreloadedParamValueSpec}
 * for one that is).
 */
export interface LiveParamValueSpec<T, N extends readonly string[]> {
  schema: ZodParser<T>;
  /**
   * The param names — a const tuple; derives `P` (each name → a string; a name
   * ending in `?` → an optional one, see {@link LiveValueParams}).
   */
  params: N;
  preload?: never;
  /** Default `"push"` (see {@link LiveValueLoad}). */
  load?: LiveValueLoad;
  /** `"central"`: served by the central runtime (see {@link LiveValueOrigin}). */
  origin?: "central";
}

/**
 * A parameterized value preloaded at boot. It has no default tuple, so the
 * SERVER names the tuples to hydrate: its `serveValue` must pass
 * `preloadParams` (a tsc error otherwise — the returned value's `preload` is
 * required, which is what `serveValue` keys the requirement on). The boot
 * snapshot loads each enumerated tuple and the client hydrates it before first
 * paint; `"boot-and-keep"` keeps every tuple of the key resident. Never
 * L2-persisted (L2 rows are one param-less tuple per key). A worktree value only.
 */
export interface LivePreloadedParamValueSpec<T, N extends readonly string[]> {
  schema: ZodParser<T>;
  /** As on {@link LiveParamValueSpec}. */
  params: N;
  preload: ResourcePreload;
  /** Default `"push"` (see {@link LiveValueLoad}). */
  load?: LiveValueLoad;
  origin?: undefined;
}

/**
 * A PARAMETERIZED preloaded value (`liveValue` with `params` and `preload`). It
 * has no default tuple, so `preloadsParams` brands it: its `serveValue` must
 * enumerate the tuples to hydrate (`preloadParams` — a tsc error without it,
 * and a throw at serve time for an untyped caller). The brand is a real field,
 * read by that throw.
 */
export type LivePreloadedParamValue<
  T,
  P extends Record<string, string>,
> = LiveValue<T, P> & { preload: ResourcePreload; preloadsParams: true };

/**
 * Declare a live value.
 *
 * ```ts
 * export const notificationsUnread = liveValue("notifications.unread", {
 *   schema: NotificationsUnreadSchema,
 *   preload: "boot",                 // "none" (default) | "boot" | "boot-and-keep"
 * });
 * export const taskDetail = liveValue("task-detail", {
 *   schema: TaskDetailSchema,
 *   params: ["id"],                  // → P = { id: string }
 *   load: "on-demand",               // "push" (default) | "on-demand"
 * });
 * export const configValues = liveValue("config-v2.values", {
 *   schema: ConfigValuesSchema,
 *   params: ["path", "scopeId?"],    // → P = { path: string; scopeId?: string }
 *   preload: "boot-and-keep",        // the served half enumerates the tuples
 * });
 * ```
 *
 * `key` stays a positional string literal: the build scanners read it
 * statically. A preloaded value also sets `defaultParams: {}`, so the boot
 * snapshot's fallback load and the client's hydrate land on the same tuple
 * `useLive(value)` subscribes to.
 *
 * `origin: "central"` declares a value the central runtime serves (the
 * browser subscribes over the central socket); its `LiveValue` carries the
 * origin in its type, so only `network/live/central`'s `serveValue` takes it.
 */
export function liveValue<T>(
  key: string,
  spec: LiveCentralValueSpec<T>,
): LiveValue<T, Record<string, never>, "central">;
export function liveValue<T>(
  key: string,
  spec: LiveValueSpec<T>,
): LiveValue<T, Record<string, never>>;
export function liveValue<T, const N extends readonly [string, ...string[]]>(
  key: string,
  spec: LivePreloadedParamValueSpec<T, N>,
): LivePreloadedParamValue<T, LiveValueParams<N>>;
export function liveValue<T, const N extends readonly [string, ...string[]]>(
  key: string,
  spec: LiveParamValueSpec<T, N> & { origin: "central" },
): LiveValue<T, LiveValueParams<N>, "central">;
export function liveValue<T, const N extends readonly [string, ...string[]]>(
  key: string,
  spec: LiveParamValueSpec<T, N> & { origin?: undefined },
): LiveValue<T, LiveValueParams<N>>;
export function liveValue<T>(
  key: string,
  spec:
    | LiveValueSpec<T>
    | LiveCentralValueSpec<T>
    | LiveParamValueSpec<T, readonly string[]>
    | LivePreloadedParamValueSpec<T, readonly string[]>,
): LiveValue<T, Record<string, string>, LiveValueOrigin> {
  const { params, optionalParams } = parseParamNames(key, spec.params ?? []);
  const preload =
    spec.preload === undefined || spec.preload === "none"
      ? undefined
      : spec.preload;
  if (preload !== undefined && spec.origin === "central") {
    // Unreachable from typed code (`preload` is `never` on a central value).
    throw new Error(
      `liveValue("${key}"): a central value cannot be preloaded — the boot ` +
        `snapshot is a worktree backend's read.`,
    );
  }
  const value: LiveValue<T, Record<string, string>, LiveValueOrigin> = {
    key,
    schema: spec.schema,
    live: "value",
    params,
    ...(optionalParams.length > 0 ? { optionalParams } : {}),
    validateParams: paramsGate(key, params, optionalParams),
    ...(spec.origin === "central" ? { origin: "central" as const } : {}),
    // A param-less preload has ONE tuple, `{}` — the one `useLive(value)`
    // reads. A param'd one has none: its server half enumerates them.
    ...(preload !== undefined
      ? {
          preload,
          ...(params.length === 0
            ? { defaultParams: {} }
            : { preloadsParams: true as const }),
        }
      : {}),
    ...(spec.load === "on-demand" ? { load: "on-demand" as const } : {}),
  };
  registerResourceDescriptor(value as ResourceDescriptor<unknown>);
  return value;
}

/**
 * Split declared param names into the bare names and the optional ones (a
 * trailing `?`). Throws on a name tsc cannot reject: empty, a `?` anywhere but
 * the end, or a duplicate.
 */
function parseParamNames(
  key: string,
  declared: readonly string[],
): { params: string[]; optionalParams: string[] } {
  const params: string[] = [];
  const optionalParams: string[] = [];
  for (const raw of declared) {
    const optional = raw.endsWith("?");
    const name = optional ? raw.slice(0, -1) : raw;
    if (name === "" || name.includes("?") || params.includes(name)) {
      throw new Error(
        `liveValue("${key}"): bad param name "${raw}" — each is a non-empty, ` +
          `unique name, optionally ending in one "?".`,
      );
    }
    params.push(name);
    if (optional) optionalParams.push(name);
  }
  return { params, optionalParams };
}

/**
 * A value's params gate: the tuple names ONLY declared params, each a string,
 * and every REQUIRED one. An optional param (`"scopeId?"`) may be absent — the
 * runtime has already folded its `undefined` / `""` spellings away
 * (`canonicalParams`) before the gate runs. Without the gate a loader reads
 * `undefined` for a required param an older (or newer) bundle does not send,
 * and fails somewhere far from the cause.
 */
function paramsGate(
  key: string,
  declared: readonly string[],
  optional: readonly string[],
): (params: Record<string, string>) => void {
  const names = new Set(declared);
  const required = declared.filter((name) => !optional.includes(name));
  return (params) => {
    const reject = (detail: string): never => {
      throw new ResourceContractError(key, `liveValue("${key}"): ${detail}`);
    };
    for (const [name, v] of Object.entries(params)) {
      if (!names.has(name)) reject(`unknown param "${name}"`);
      if (typeof v !== "string") {
        reject(`param "${name}" must be a string, got ${JSON.stringify(v)}`);
      }
    }
    for (const name of required) {
      if (!Object.hasOwn(params, name)) reject(`missing param "${name}"`);
    }
  };
}
