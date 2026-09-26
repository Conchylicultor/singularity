import type { ZodParser } from "@plugins/packages/plugins/zod-parser/core";

// `origin` tells the browser-side NotificationsClient which WS endpoint owns
// this resource: per-worktree backends serve the default origin, central
// serves resources tagged "central" via /ws/central-notifications.
export type ResourceOrigin = "central";

/**
 * How a descriptor preloads — see `ResourceDescriptor.preload`. Absent means
 * "on first mount"; the unified API spells that `"none"` (`LivePreload`).
 */
export type ResourcePreload = "boot" | "boot-and-keep";

/** The trailing options of the old descriptor factories. */
export interface ResourceDescriptorOptions {
  preload?: ResourcePreload;
  /** Config only — see `ResourceDescriptor.resident`. */
  resident?: true;
}

export interface ResourceDescriptor<
  T,
  P extends Record<string, string> = Record<string, string>,
> {
  key: string;
  origin?: ResourceOrigin;
  /**
   * Zod schema for the resource's payload. The client parses every payload
   * through this schema before it lands in the TanStack cache, both at the
   * queryFn HTTP fallback and on every WS push. Required so types like `Date`
   * that don't survive `JSON.parse` are coerced (`z.coerce.date()`) on the way
   * in — `T` is bound to the schema's parse output, so type and runtime can't
   * drift.
   */
  schema: ZodParser<T>;
  /**
   * Optional typed placeholder used as TanStack Query's `initialData`. It is
   * NEVER a value: it is seeded with `initialDataUpdatedAt: 0`, and
   * `useResource` reports `pending` while `dataUpdatedAt === 0`, so a consumer
   * never reads it as data. Its one real reader is `useOptimisticResource`'s
   * pending overlay base (which requires a descriptor that has one).
   *
   * Absent (a `liveValue`) ⇒ no placeholder at all: the query simply has no
   * data until the first authoritative value, still `pending` at
   * `dataUpdatedAt === 0`. Not known yet is a state, not a stand-in value.
   */
  initialData?: T;
  /**
   * Marks a row-keyed delta-sync resource (server `mode: "keyed"`). The server
   * ships only changed rows + the id order; the client merges by id. `keyOf`
   * extracts each row's stable id so the client can rebuild its id→row map from
   * the prior cache value when applying a delta. See
   * research/2026-06-05-global-live-state-delta-sync.md.
   */
  keyed?: { keyOf: (row: unknown) => string };
  /**
   * When the resource is loaded ahead of any mount. Absent ⇒ on first mount.
   *
   * - `"boot"`: the boot snapshot hydrates its default tuple (`defaultParams`,
   *   else `{}`) before first paint, the owning plugin is pinned to the eager
   *   load tier, and a DB-backed one is L2-persisted for instant cold boot.
   * - `"boot-and-keep"`: `"boot"`, and the client also keeps the cached value
   *   resident for the tab's lifetime (`gcTime: Infinity`), so a surface that
   *   mounts late never re-enters a loading window boot already closed. Only for
   *   values small and universally read enough to hold that long.
   *
   * Declared here — on the shared descriptor — so build-time codegen can
   * statically see which plugin owns a preloaded descriptor (the eager-tier
   * generator scans for it through the resource vocabulary), and the server
   * derives its `Resource.Declare` payload from it. Single source of truth.
   */
  preload?: ResourcePreload;
  /**
   * Config only — deleted by Resources page item 9 (config hydration folds into
   * the boot snapshot). Keeps the cached value resident (`gcTime: Infinity`)
   * like `preload: "boot-and-keep"`, for config's two resources, which hydrate
   * N param tuples through config's own boot task rather than the boot
   * snapshot's single default tuple — so they cannot honestly say
   * `"boot-and-keep"` yet. Every other resource spells it through `preload`.
   */
  resident?: true;
  /**
   * Default params tuple boot paths use when a caller names none — e.g. a
   * windowed resource's default window (`windowQueryResourceDescriptor` sets it to
   * the encoded `defaultLimit`). Read generically by boot-snapshot on BOTH
   * sides, so the server's fallback load and the client's pre-paint hydration
   * land on the IDENTICAL `(key, paramsKey)` tuple that `useWindowResource`
   * later subscribes to. Absent ⇒ the param-less `{}` tuple (every plain
   * global resource).
   */
  defaultParams?: P;
  /** Phantom — exists only at the type level so `useResource` can infer `P`. */
  readonly __params?: P;
}

// Module-level key→descriptor registry. Populated by descriptor-module evaluation
// (each factory call below runs on import), so a key→descriptor lookup exists before
// first paint — boot-snapshot hydration resolves the server's snapshot keys against it
// instead of a hand-maintained client list. Keys are unique per resource by construction.
const byKey = new Map<string, ResourceDescriptor<unknown>>();

/**
 * Register a descriptor in the key→descriptor map boot hydration resolves
 * against. Every factory here calls it; exported for the descriptor factories
 * other plugins own (`network/live`'s `liveValue`), which build a descriptor
 * shape these factories do not (no `initialData`). A plugin DECLARING a
 * resource never calls it — it goes through a factory of the resource
 * vocabulary, which is what the build scanners can see.
 */
export function registerResourceDescriptor(
  d: ResourceDescriptor<unknown>,
): void {
  const existing = byKey.get(d.key);
  // Dev guard: a genuine key collision (two distinct descriptors, same key) would
  // silently shadow one resource. HMR re-eval (same logical descriptor, new object)
  // is benign — only warn when the schemas differ.
  if (existing && existing !== d && existing.schema !== d.schema) {
    console.warn(
      `[live-state] duplicate resource descriptor for key "${d.key}"`,
    );
  }
  byKey.set(d.key, d);
}

export function resourceDescriptorByKey(
  key: string,
): ResourceDescriptor<unknown> | undefined {
  return byKey.get(key);
}

// The `keyed?: never` in the return type makes non-keyed-ness statically visible,
// so the server's `defineResource(descriptor, …)` two-arg overload can discriminate
// a plain descriptor from a keyed one (and only the keyed branch demands a scope
// policy). Without it, `keyed` is merely optional and neither branch matches.
export function resourceDescriptor<
  T,
  P extends Record<string, string> = Record<string, never>,
>(
  key: string,
  schema: ZodParser<T>,
  initialData: T,
  opts?: ResourceDescriptorOptions,
): ResourceDescriptor<T, P> & { keyed?: never; initialData: T } {
  const d = { key, schema, initialData, ...opts };
  registerResourceDescriptor(d as ResourceDescriptor<unknown>);
  return d;
}

// Keyed delta-sync variant of `resourceDescriptor`. The matching server
// resource must declare `mode: "keyed"` with the same row identity. `schema`
// stays `z.array(Element)`, so `T` (and every `useResource` caller) is
// unchanged — the client merges per-row deltas into the same `T[]`. `keyOf`
// lets the client key prior cache rows when applying a delta.
// The `keyed: { keyOf }` is REQUIRED in the return type (not the descriptor's
// optional field), so the server's two-arg `defineResource` can statically see a
// keyed descriptor and force a scope policy on it.
export function keyedResourceDescriptor<
  T extends unknown[],
  P extends Record<string, string> = Record<string, never>,
>(
  key: string,
  schema: ZodParser<T>,
  initialData: T,
  keyOf: (row: unknown) => string,
  opts?: ResourceDescriptorOptions,
): ResourceDescriptor<T, P> & {
  keyed: { keyOf: (row: unknown) => string };
  initialData: T;
} {
  const d = { key, schema, initialData, keyed: { keyOf }, ...opts };
  registerResourceDescriptor(d as ResourceDescriptor<unknown>);
  return d;
}

// Like `resourceDescriptor` but tagged for the central WS endpoint. The
// `keyed?: never` mirrors `resourceDescriptor` so a central resource passed to
// the two-arg `defineResource(descriptor, …)` form matches the non-keyed
// overload (central resources are never keyed — there is no DB change-feed to
// scope a delta against).
export function centralResourceDescriptor<
  T,
  P extends Record<string, string> = Record<string, never>,
>(
  key: string,
  schema: ZodParser<T>,
  initialData: T,
  opts?: ResourceDescriptorOptions,
): ResourceDescriptor<T, P> & { keyed?: never; initialData: T } {
  const d = { key, origin: "central" as const, schema, initialData, ...opts };
  registerResourceDescriptor(d as ResourceDescriptor<unknown>);
  return d;
}
