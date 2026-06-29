import { useMemo } from "react";
import { useLatestRef } from "@plugins/primitives/plugins/latest-ref/web";
import {
  useCustomColumnValues,
  useSetCustomColumnValue,
} from "@plugins/primitives/plugins/data-view/plugins/custom-columns/web";
import type { CustomColumnDef } from "@plugins/primitives/plugins/data-view/plugins/custom-columns/core";
import type { DataViewId, FieldDef, FieldValue } from "../../core";

/**
 * Bridge: composes the per-surface custom-column DEFINITIONS (config, threaded in
 * as `defs`) with the per-row VALUES (live resource) into ordinary `FieldDef[]`
 * the host appends to `props.fields`, so custom columns flow through every view +
 * sort/filter/search for free.
 *
 * Lives in the data-view host (NOT the custom-columns child) because it returns
 * data-view's own `FieldDef` type — a child→parent import would form the banned
 * `data-view ⇄ custom-columns` cycle. The legal direction (parent → child) holds:
 * the host imports the child's value hook + mutation here.
 *
 * `rowKey` is captured via `useLatestRef` to decouple from the consumer's inline
 * arrow identity (typically re-created every render), so the produced fields stay
 * referentially stable across renders. The bridge calls `rowKey(row, 0)` —
 * `FieldDef.value`/`onEdit` get no index, so consumers with index-derived row
 * keys must set `customColumns={false}` (documented edge case).
 */
export function useCustomColumnFields<TRow>(opts: {
  storageKey: DataViewId;
  rowKey: (row: TRow, index: number) => string;
  defs: CustomColumnDef[];
}): FieldDef<TRow>[] {
  const { storageKey, defs } = opts;
  const values = useCustomColumnValues(storageKey);
  const setValue = useSetCustomColumnValue();
  const rowKeyRef = useLatestRef(opts.rowKey);

  return useMemo(
    () =>
      defs.map(
        (def): FieldDef<TRow> => ({
          id: def.id,
          label: def.label,
          // NOT a literal — the field-type registry is the extension seam for
          // future number/date/checkbox columns.
          type: def.type,
          value: (row): FieldValue =>
            values.get(rowKeyRef.current(row, 0))?.get(def.id) ?? "",
          onEdit: (row, next) =>
            setValue({
              dataViewId: storageKey,
              rowKey: rowKeyRef.current(row, 0),
              columnId: def.id,
              value: String(next ?? ""),
            }),
          sortable: true,
          filterable: true,
        }),
      ),
    [defs, values, setValue, storageKey, rowKeyRef],
  );
}
