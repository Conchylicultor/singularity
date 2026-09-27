import { useCallback, useMemo } from "react";
import { useLive } from "@plugins/network/plugins/live/web";
import { useEndpointMutation } from "@plugins/infra/plugins/endpoints/web";
import {
  customColumnValues,
  setCustomColumnValue,
  deleteCustomColumnValues,
  type SetCustomColumnValueBody,
  type DeleteCustomColumnValuesBody,
} from "../../core";

/** `Map<rowKey, Map<columnId, value>>` for O(1) per-cell reads. */
export type CustomColumnValueIndex = Map<string, Map<string, string>>;

/**
 * A surface's custom-column values: `pending` until the first value lands, then
 * the settled index. A union, so "not loaded yet" can never be read as "no cell
 * has a value" — the caller decides what a cell shows meanwhile.
 */
export type CustomColumnValues =
  { pending: true } | { pending: false; index: CustomColumnValueIndex };

/**
 * Subscribe to a surface's custom-column values and index them by
 * `(rowKey, columnId)`.
 */
export function useCustomColumnValues(dataViewId: string): CustomColumnValues {
  const result = useLive(customColumnValues, { dataViewId });
  return useMemo((): CustomColumnValues => {
    if (result.pending) return { pending: true };
    const index: CustomColumnValueIndex = new Map();
    for (const row of result.data) {
      let byColumn = index.get(row.rowKey);
      if (!byColumn) {
        byColumn = new Map();
        index.set(row.rowKey, byColumn);
      }
      byColumn.set(row.columnId, row.value);
    }
    return { pending: false, index };
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
