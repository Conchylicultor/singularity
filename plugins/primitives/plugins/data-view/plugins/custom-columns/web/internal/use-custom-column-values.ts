import { useCallback, useMemo } from "react";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { useEndpointMutation } from "@plugins/infra/plugins/endpoints/web";
import {
  customColumnValuesResource,
  setCustomColumnValue,
  deleteCustomColumnValues,
  type SetCustomColumnValueBody,
  type DeleteCustomColumnValuesBody,
} from "../../core";

/** `Map<rowKey, Map<columnId, value>>` for O(1) per-cell reads. */
export type CustomColumnValueIndex = Map<string, Map<string, string>>;

/**
 * Subscribe to a surface's custom-column values and index them by
 * `(rowKey, columnId)`. While the resource is still pending the index is empty —
 * cells render blank until the first push (values, not a confirmed-empty gate).
 */
export function useCustomColumnValues(
  dataViewId: string,
): CustomColumnValueIndex {
  const result = useResource(customColumnValuesResource, { dataViewId });
  return useMemo(() => {
    const index: CustomColumnValueIndex = new Map();
    if (result.pending) return index;
    for (const row of result.data) {
      let byColumn = index.get(row.rowKey);
      if (!byColumn) {
        byColumn = new Map();
        index.set(row.rowKey, byColumn);
      }
      byColumn.set(row.columnId, row.value);
    }
    return index;
  }, [result]);
}

/** Upsert (or delete-on-empty) a single custom-column cell value. */
export function useSetCustomColumnValue(): (
  args: SetCustomColumnValueBody,
) => void {
  const { mutate } = useEndpointMutation(setCustomColumnValue);
  return useCallback((args) => mutate({ body: args }), [mutate]);
}

/** Delete every per-row value for one column across a surface (column removal). */
export function useDeleteCustomColumnValues(): (
  args: DeleteCustomColumnValuesBody,
) => void {
  const { mutate } = useEndpointMutation(deleteCustomColumnValues);
  return useCallback((args) => mutate({ body: args }), [mutate]);
}
