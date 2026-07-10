import { useCallback, useMemo } from "react";
import { useEndpointMutation } from "@plugins/infra/plugins/endpoints/web";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import type { Rank } from "@plugins/primitives/plugins/rank/core";
import { rowOrderResource, setRowOrder, type SetRowOrderBody } from "../../core";

export interface RowOrderState {
  /** `rowKey → Rank`, rank-ascending (the resource's own order). */
  persisted: Map<string, Rank>;
  /** True until the first push lands — the caller must NOT render a half-order. */
  pending: boolean;
}

/**
 * Subscribe to one view instance's persisted row order. While pending the map is
 * empty AND `pending` is true, so the caller can distinguish "no order yet
 * loaded" from "this view has genuinely never been reordered" — the two must
 * render differently (defer vs. seed-everything).
 */
export function useRowOrder(dataViewId: string, viewId: string): RowOrderState {
  const result = useResource(rowOrderResource, { dataViewId, viewId });
  return useMemo(() => {
    if (result.pending) return { persisted: new Map<string, Rank>(), pending: true };
    return {
      persisted: new Map(result.data.map((row) => [row.rowKey, row.rank])),
      pending: false,
    };
  }, [result]);
}

/** Replace a view instance's entire manual row order. */
export function useSetRowOrder(): (args: SetRowOrderBody) => void {
  const { mutate } = useEndpointMutation(setRowOrder);
  return useCallback((args) => mutate({ body: args }), [mutate]);
}
