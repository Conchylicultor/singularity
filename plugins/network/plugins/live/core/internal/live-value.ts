import type { ZodParser } from "@plugins/packages/plugins/zod-parser/core";
import {
  registerResourceDescriptor,
  type ResourceDescriptor,
  type ResourcePreload,
} from "@plugins/primitives/plugins/live-state/core";
import type { LivePreload } from "./live-collection";

// `liveValue` — the declaration half of a live VALUE: one payload per params
// tuple, pushed whole whenever it changes (the server half is `serveValue`, the
// read is `useLive(value, params?)`). A value has no rows, no window and no id
// set; anything row-shaped and growing is a `liveCollection`.
//
// Not known yet is a STATE: a value declares no `initial` placeholder. Its read
// is `pending` until the first authoritative value lands — or settled on its
// first render when the boot snapshot preloaded it.

/** The params object a value's declared param names derive: every name → a string. */
export type LiveValueParams<N extends readonly string[]> = {
  [K in N[number]]: string;
};

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
  "initialData" | "keyed" | "preload" | "origin"
> &
  OriginField<O> & {
    live: "value";
    /** The declared param names — `P`'s keys. Empty for a param-less value. */
    params: readonly (keyof P & string)[];
    /** Absent ⇒ loaded on first mount (the declaration's `"none"`). */
    preload?: ResourcePreload;
    /** A value has no placeholder: not known yet is `pending`, never a stand-in. */
    initialData?: never;
    /** A value is pushed whole — never a row-keyed delta. */
    keyed?: never;
  };

/** A param-less value: may be preloaded. */
export interface LiveValueSpec<T> {
  /** The payload's wire schema — every push and HTTP read parses through it. */
  schema: ZodParser<T>;
  params?: undefined;
  /** Default `"none"` (see {@link LivePreload}). */
  preload?: LivePreload;
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
  origin: "central";
}

/**
 * A parameterized value. `preload` is `never`: a preloaded value needs a default
 * tuple the server can load before any tab names one, and only a param-less
 * value has one.
 */
export interface LiveParamValueSpec<T, N extends readonly string[]> {
  schema: ZodParser<T>;
  /** The param names — a const tuple; derives `P` (each name → a string). */
  params: N;
  preload?: never;
  /** `"central"`: served by the central runtime (see {@link LiveValueOrigin}). */
  origin?: "central";
}

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
 *   params: ["id"],                  // → P = { id: string }; no preload
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
    | LiveParamValueSpec<T, readonly string[]>,
): LiveValue<T, Record<string, string>, LiveValueOrigin> {
  const params = spec.params ?? [];
  const preload =
    spec.preload === undefined || spec.preload === "none"
      ? undefined
      : spec.preload;
  if (preload !== undefined && params.length > 0) {
    // Unreachable from typed code (`preload` is `never` beside `params`).
    throw new Error(
      `liveValue("${key}"): a parameterized value cannot be preloaded — the ` +
        `server has no default tuple to load before a tab names one.`,
    );
  }
  const value: LiveValue<T, Record<string, string>, LiveValueOrigin> = {
    key,
    schema: spec.schema,
    live: "value",
    params,
    ...(spec.origin === "central" ? { origin: "central" as const } : {}),
    ...(preload !== undefined ? { preload, defaultParams: {} } : {}),
  };
  registerResourceDescriptor(value as ResourceDescriptor<unknown>);
  return value;
}
