import { useCallback, useMemo } from "react";
import { useResource, type ResourceResult } from "./use-resource";
import type {
  PointResourceDescriptor,
  WindowResourceDescriptor,
  WindowSelector,
} from "../core/window";

/**
 * Subscribe to a bounded ordered window of a window resource. Defaults to the
 * descriptor's default window, so a bare `useWindowResource(r)` lands on the
 * SAME `(key, paramsKey)` tuple boot-snapshot hydrated (`r.defaultParams`) —
 * no duplicate per-tuple state, no post-boot re-load.
 */
export function useWindowResource<El>(
  resource: WindowResourceDescriptor<El>,
  window?: WindowSelector,
): ResourceResult<El[]> {
  const limit = window?.limit;
  const params = useMemo(() => resource.window.encode({ limit }), [resource, limit]);
  return useResource(resource, params);
}

/**
 * Subscribe to ONE row of a point resource — the O(1) replacement for the
 * O(n) `.find()` over a whole-collection resource. The subscription's params
 * tuple carries just this id, so the payload is a 0-or-1-element array; the
 * settled arm narrows it to row-or-null (`null` = the server answered and the
 * row does not exist — a determinate value, not a loading state). Built on
 * `useResource`'s documented select/gate mechanics: `gate: true` keeps the
 * pending→settled flip reliable when the slice is `null` on both sides of the
 * initialData→first-real-data boundary (see "Slice selectors" in CLAUDE.md).
 */
export function usePointResource<El>(
  resource: PointResourceDescriptor<El>,
  id: string,
): ResourceResult<El | null> {
  const params = useMemo(() => resource.point.encode([id]), [resource, id]);
  const select = useCallback((rows: El[]) => rows[0] ?? null, []);
  return useResource(resource, params, { select, gate: true });
}

/**
 * Subscribe to an explicit id set of a point resource as ONE coalesced tuple.
 * Per-row single-id subs (`usePointResource` per row) are the decided default
 * — keep-alive + sub-batch absorb the churn; reach for this only when a
 * surface genuinely wants one sub for a visible set. The params are canonical
 * (sorted, deduped), so the same logical set always shares one tuple
 * regardless of caller order.
 */
export function usePointResources<El>(
  resource: PointResourceDescriptor<El>,
  ids: readonly string[],
): ResourceResult<El[]> {
  const idsKey = resource.point.encode(ids).ids;
  const params = useMemo(() => ({ ids: idsKey }), [idsKey]);
  return useResource(resource, params);
}
