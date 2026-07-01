import { useMemo, type ReactNode } from "react";
import type { ConfigDescriptor } from "@plugins/config_v2/core";
import type { FieldsRecord } from "@plugins/fields/core";
import { useLatestRef } from "@plugins/primitives/plugins/latest-ref/web";
import {
  getDataViewDescriptor,
  type GlobalFieldExtensionProps,
} from "@plugins/primitives/plugins/data-view/web";
import type {
  DataViewId,
  FieldDef,
  FieldValue,
} from "@plugins/primitives/plugins/data-view/core";
import { useCustomColumnDefs } from "../internal/use-custom-column-defs";
import {
  useCustomColumnValues,
  useSetCustomColumnValue,
} from "../internal/use-custom-column-values";

/**
 * Global field-extension contribution: composes the per-surface custom-column
 * DEFINITIONS (config) with the per-row VALUES (live resource) into ordinary
 * `FieldDef[]` and hands them back through `render`, so the data-view host folds
 * them into the schema — custom columns then flow through every view +
 * sort/filter/search for free.
 *
 * This inverts the old host-owned `useCustomColumnFields` bridge: custom-columns
 * now imports data-view's `FieldDef`/`DataViewId` + `getDataViewDescriptor` (a
 * legal child→parent edge) rather than the host importing custom-columns' hooks.
 */
export function CustomColumnFieldExtension({
  storageKey,
  rowKey,
  render,
}: GlobalFieldExtensionProps): ReactNode {
  const descriptor = getDataViewDescriptor(storageKey);
  // Soft-disable for a storageKey with no registered viewsDescriptor — preserves
  // the old host's `descriptor != null` gate. `storageKey` is stable per surface,
  // so this branch is hook-order-stable (the `Inner` hooks never conditionally
  // appear/disappear within one surface).
  if (!descriptor) return <>{render([])}</>;
  return (
    <Inner
      descriptor={descriptor}
      storageKey={storageKey}
      rowKey={rowKey}
      render={render}
    />
  );
}

/**
 * The bridge body (formerly the host's `useCustomColumnFields`): read defs +
 * values, map each `CustomColumnDef` → `FieldDef<unknown>`, and emit via `render`.
 *
 * `rowKey` is captured via `useLatestRef` to decouple from the consumer's inline
 * arrow identity (re-created every render), so the produced fields stay
 * referentially stable across renders. The bridge calls `rowKey(row, 0)` —
 * `FieldDef.value`/`onEdit` get no index, so a surface with index-derived row keys
 * cannot key custom-column values (a documented edge case).
 */
function Inner({
  descriptor,
  storageKey,
  rowKey,
  render,
}: {
  descriptor: ConfigDescriptor<FieldsRecord>;
  storageKey: DataViewId;
  rowKey: (row: unknown, index: number) => string;
  render: (fields: FieldDef<unknown>[]) => ReactNode;
}): ReactNode {
  const { defs } = useCustomColumnDefs(descriptor);
  const values = useCustomColumnValues(storageKey);
  const setValue = useSetCustomColumnValue();
  const rowKeyRef = useLatestRef(rowKey);

  const fields = useMemo(
    () =>
      defs.map(
        (def): FieldDef<unknown> => ({
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

  return <>{render(fields)}</>;
}
