/**
 * Readiness combinators over resource results. These exist to kill the
 * `result.pending ? [] : result.data` idiom, which collapses "still loading"
 * and "genuinely empty" into the same value at the exact line where the
 * distinction still exists — the root of the wrong-state-while-loading bug
 * class (enforced by the `live-state/no-pending-data-collapse` lint rule).
 *
 * Correct patterns:
 *   - one resource, JSX:        <ResourceView resource={r}>{(data) => …}</ResourceView>
 *   - one resource, expression: matchResource(r, { ready: (data) => … })
 *   - several resources:        combineResources({ a, b, c }) — all-or-nothing,
 *     so a view can never render from a half-loaded snapshot
 *
 * GATE RESTRICTION: feed only whole-resource results (no `select`) into these.
 * A select-scoped subscription can flip `pending` without a re-render when the
 * selected slice is identical across the initialData→first-real-data boundary
 * (see use-resource.ts) — a gate built on one can wedge as pending forever.
 * For a select-based readiness read, pass `gate: true` to useResource instead.
 */

/**
 * Anything gateable on readiness: a `useResource` result (discriminated
 * union), a `combineResources` result, or `useOptimisticResource`'s
 * `{ data, pending }` shape.
 */
export type GateInput = { pending: boolean };

/** The settled data type carried by a gateable result. */
export type GateDataOf<R> = R extends { pending: false; data: infer D }
  ? D
  : R extends { data: infer D }
    ? D
    : never;

export type CombinedResources<T extends Record<string, GateInput>> =
  | { pending: true; error: Error | null }
  | {
      pending: false;
      data: { [K in keyof T]: GateDataOf<T[K]> };
      error: Error | null;
    };

/**
 * Promise.all for resource results: `pending` until EVERY input has settled
 * once, then `data` carries each input's settled value under its key. `error`
 * is the first non-null input error (available in both states).
 *
 * Pure function — for a render-stable identity inside a component, use
 * `useCombinedResources`.
 */
export function combineResources<T extends Record<string, GateInput>>(
  inputs: T,
): CombinedResources<T> {
  let error: Error | null = null;
  let pending = false;
  for (const r of Object.values(inputs)) {
    const e = (r as { error?: Error | null }).error ?? null;
    if (e && !error) error = e;
    if (r.pending) pending = true;
  }
  if (pending) return { pending: true, error };
  const data = Object.fromEntries(
    Object.entries(inputs).map(([k, r]) => [
      k,
      (r as unknown as { data: unknown }).data,
    ]),
  ) as { [K in keyof T]: GateDataOf<T[K]> };
  return { pending: false, data, error };
}

/**
 * `combineResources` with a render-stable identity: recomputes only when one
 * of the input results changes (useResource memoizes its result, so this is
 * safe to use as a useMemo/useEffect dependency).
 *
 * The set of keys must be static for a given call site (rules-of-hooks).
 */
export function useCombinedResources<T extends Record<string, GateInput>>(
  inputs: T,
): CombinedResources<T> {
  return combineResources(inputs);
}
