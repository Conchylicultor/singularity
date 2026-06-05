import type { ZodType } from "zod";

// `origin` tells the browser-side NotificationsClient which WS endpoint owns
// this resource: per-worktree backends serve the default origin, central
// serves resources tagged "central" via /ws/central-notifications.
export type ResourceOrigin = "central";

export interface ResourceDescriptor<T, P extends Record<string, string> = Record<string, string>> {
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
  schema: ZodType<T>;
  /**
   * Default value used as TanStack Query's `initialData` so `useResource`
   * always returns `DefinedUseQueryResult<T>` (i.e. `data: T`, never
   * `T | undefined`). Consumers no longer need `?? []` or loading guards.
   *
   * The initial data is seeded with `initialDataUpdatedAt: 0` so consumers
   * that need a loading distinction can check `dataUpdatedAt === 0`.
   */
  initialData: T;
  /**
   * Marks a row-keyed delta-sync resource (server `mode: "keyed"`). The server
   * ships only changed rows + the id order; the client merges by id. `keyOf`
   * extracts each row's stable id so the client can rebuild its id→row map from
   * the prior cache value when applying a delta. See
   * research/2026-06-05-global-live-state-delta-sync.md.
   */
  keyed?: { keyOf: (row: unknown) => string };
  /** Phantom — exists only at the type level so `useResource` can infer `P`. */
  readonly __params?: P;
}

export function resourceDescriptor<T, P extends Record<string, string> = Record<string, never>>(
  key: string,
  schema: ZodType<T>,
  initialData: T,
): ResourceDescriptor<T, P> {
  return { key, schema, initialData };
}

// Keyed delta-sync variant of `resourceDescriptor`. The matching server
// resource must declare `mode: "keyed"` with the same row identity. `schema`
// stays `z.array(Element)`, so `T` (and every `useResource` caller) is
// unchanged — the client merges per-row deltas into the same `T[]`. `keyOf`
// lets the client key prior cache rows when applying a delta.
export function keyedResourceDescriptor<T extends unknown[], P extends Record<string, string> = Record<string, never>>(
  key: string,
  schema: ZodType<T>,
  initialData: T,
  keyOf: (row: unknown) => string,
): ResourceDescriptor<T, P> {
  return { key, schema, initialData, keyed: { keyOf } };
}

export function centralResourceDescriptor<T, P extends Record<string, string> = Record<string, never>>(
  key: string,
  schema: ZodType<T>,
  initialData: T,
): ResourceDescriptor<T, P> {
  return { key, origin: "central", schema, initialData };
}
