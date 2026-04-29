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
  /** Phantom — exists only at the type level so `useResource` can infer `P`. */
  readonly __params?: P;
}

export function resourceDescriptor<T, P extends Record<string, string> = Record<string, never>>(
  key: string,
  schema: ZodType<T>,
): ResourceDescriptor<T, P> {
  return { key, schema };
}

export function centralResourceDescriptor<T, P extends Record<string, string> = Record<string, never>>(
  key: string,
  schema: ZodType<T>,
): ResourceDescriptor<T, P> {
  return { key, origin: "central", schema };
}
