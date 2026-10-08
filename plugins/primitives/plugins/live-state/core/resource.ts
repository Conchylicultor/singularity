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
   * never reads it as data. Nothing takes it as a base either:
   * `useOptimisticResource` reads a declaration and stays `pending` until the
   * first authoritative value.
   *
   * Absent (a `liveValue`, a `liveCollection`'s window / `:rows` / `:groups`)
   * ⇒ no placeholder at all: the query simply has no data until the first
   * authoritative value, still `pending` at `dataUpdatedAt === 0`. Not known
   * yet is a state, not a stand-in value. Only the two page descriptors
   * (`resourceDescriptor`) still seed one (Resources page item 9).
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
   *   load tier, and a DB-backed one is L2-persisted for instant cold boot. A
   *   PARAMETERIZED `liveValue` may be preloaded too: its server half enumerates
   *   the tuples to hydrate (`serveValue`'s `preloadParams`), and it is never
   *   L2-persisted.
   * - `"boot-and-keep"`: `"boot"`, and the client also keeps every cached tuple
   *   of the key resident for the tab's lifetime (`gcTime: Infinity`, set as a
   *   query default before the first tuple is built — hydrated or observed), so
   *   a surface that mounts late never re-enters a loading window boot already
   *   closed. Only for values small and universally read enough to hold that
   *   long.
   *
   * Declared here — on the shared descriptor — so build-time codegen can
   * statically see which plugin owns a preloaded descriptor (the eager-tier
   * generator scans for it through the resource vocabulary), and the server
   * derives its `Resource.Declare` payload from it. Single source of truth.
   */
  preload?: ResourcePreload;
  /**
   * `"on-demand"`: the server never ships this resource's value over the
   * socket — a change sends an `invalidate` and each tab refetches over HTTP
   * (the runtime's `invalidate` mode). The CLIENT must know it: with no
   * placeholder, `useResource` otherwise waits for a sub-ack value that this
   * mode never sends. Declared here, on the shared descriptor, so the server's
   * delivery mode and the client's read cannot disagree (`liveValue`'s `load`;
   * the server derives its mode from it). Absent ⇒ pushed.
   */
  load?: "on-demand";
  /**
   * The param names that may be absent (a `liveValue`'s `"scopeId?"`). An
   * optional param is present iff it is a non-empty string: `canonicalParams`
   * drops an `undefined` or `""` one, wherever params enter the substrate, so
   * `{ path }`, `{ path, scopeId: undefined }` and `{ path, scopeId: "" }` are
   * one tuple. Absent ⇒ every declared param is required.
   */
  optionalParams?: readonly string[];
  /**
   * Default params tuple boot paths use when a caller names none — e.g. a
   * `liveCollection`'s window (its window descriptor sets it to the encoded
   * `defaultLimit`). Read generically by boot-snapshot on BOTH
   * sides, so the server's fallback load and the client's pre-paint hydration
   * land on the IDENTICAL `(key, paramsKey)` tuple that a bare `useLive(c)`
   * later subscribes to. Absent ⇒ the param-less `{}` tuple (every plain
   * global resource).
   */
  defaultParams?: P;
  /**
   * The params gate: throws `ResourceContractError`
   * (`@plugins/packages/plugins/resource-protocol/core`) when a subscription's
   * wire params do not match this declaration. The resource runtime runs it
   * BEFORE registering a sub or serving an HTTP read, so a mismatched sub — in
   * practice a tab running an older bundle after a deploy — is refused as
   * `contract-mismatch` and never re-run by a push. Required, so every factory
   * decides: `liveValue` checks its declared param names, a `liveCollection`'s
   * resources run their strict decoders, and the legacy factory below states
   * {@link acceptAnyParams} by name.
   */
  validateParams: (params: Record<string, string>) => void;
  /** Phantom — exists only at the type level so `useResource` can infer `P`. */
  readonly __params?: P;
}

/**
 * The params gate of a legacy descriptor (`resourceDescriptor` — the two page
 * resources): accepts any params, because those loaders never declared their
 * param names.
 * Named, so "this resource validates nothing" is a visible choice rather than
 * an absent field.
 */
export function acceptAnyParams(_params: Record<string, string>): void {}

// Module-level key→descriptor registry. Populated by descriptor-module evaluation
// (each factory call below runs on import), so a key→descriptor lookup exists before
// first paint — boot-snapshot hydration resolves the server's snapshot keys against it
// instead of a hand-maintained client list. Keys are unique per resource by construction.
const byKey = new Map<string, ResourceDescriptor<unknown>>();

/**
 * Register a descriptor in the key→descriptor map boot hydration resolves
 * against. Every factory here calls it; exported for the descriptor factories
 * other plugins own (`network/live`'s `liveValue` and `liveCollection`), which
 * build a descriptor shape these factories do not (no `initialData`). A plugin DECLARING a
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
  const d = {
    key,
    schema,
    initialData,
    validateParams: acceptAnyParams,
    ...opts,
  };
  registerResourceDescriptor(d as ResourceDescriptor<unknown>);
  return d;
}
