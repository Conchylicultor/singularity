import { useMemo, type ReactNode } from "react";
import type { ConfigDescriptor } from "@plugins/config_v2/core";
import type { FieldsRecord } from "@plugins/fields/core";
import { resolveTypeChain } from "@plugins/fields/core";
import { useLatestRef } from "@plugins/primitives/plugins/latest-ref/web";
import { foldResource } from "@plugins/primitives/plugins/live-state/web";
import {
  getDataViewDescriptor,
  useResolveValueCodec,
  useResolveOperatorSet,
  useResolveColumnDerive,
  useFieldIdentities,
} from "@plugins/primitives/plugins/data-view/web";
import type {
  DataViewId,
  FieldDef,
  FieldExtensionProps,
} from "@plugins/primitives/plugins/data-view/core";
import { scopedLiveColumns } from "@plugins/network/plugins/live/core";
import { CUSTOM_COLUMNS_SET } from "../../core";
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
  liveColumnScope,
  render,
}: FieldExtensionProps<unknown>): ReactNode {
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
      liveColumnScope={liveColumnScope}
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
  liveColumnScope,
  render,
}: {
  descriptor: ConfigDescriptor<FieldsRecord>;
  storageKey: DataViewId;
  rowKey: (row: unknown, index: number) => string;
  liveColumnScope: string | null;
  render: (fields: FieldDef<unknown>[]) => ReactNode;
}): ReactNode {
  const { defs } = useCustomColumnDefs(descriptor, storageKey);
  const values = useCustomColumnValues(storageKey);
  const setValue = useSetCustomColumnValue();
  const rowKeyRef = useLatestRef(rowKey);
  const resolveCodec = useResolveValueCodec();
  const resolveOps = useResolveOperatorSet();
  const deriveFromConfig = useResolveColumnDerive();
  const identities = useFieldIdentities();

  // A failed values read with nothing held: stamped onto every custom field so
  // its cells render the failure (with Retry) rather than read as unset. A
  // failure over a held value keeps painting that value (live-state reports it).
  const readError = useMemo(
    () =>
      foldResource(values, {
        loading: () => undefined,
        error: (error, stale) =>
          stale === undefined ? { error, refetch: values.refetch } : undefined,
        ready: () => undefined,
      }),
    [values],
  );

  const fields = useMemo(() => {
    // Capability-derived flags — NO type-name literals. A type is filterable
    // when it resolves a non-empty filter operator set (in that set's domain);
    // sortable when some type in its `extends` chain declares a `coerce` (the
    // sortable scalar projection). Hardcoding `true` would show an empty filter
    // UI for types (e.g. avatar) with no filter operators / no coerce.
    const capabilities = new Map(
      defs.map((def) => {
        const ops = resolveOps(def.type);
        return [
          def.id,
          {
            domain:
              ops !== undefined && ops.operators.length > 0 ? ops.domain : null,
            sortable: resolveTypeChain(def.type, identities).some(
              (id) => identities.get(id)?.coerce != null,
            ),
          },
        ] as const;
      }),
    );
    // Under a live source whose collection takes this surface's scoped
    // columns, each column sorts and filters server-side as a member of the
    // `custom` set (`custom.<id>`), declared as the definitions stand now; the
    // server decodes it against ITS definitions.
    const scoped =
      liveColumnScope === null
        ? null
        : scopedLiveColumns(
            liveColumnScope,
            CUSTOM_COLUMNS_SET,
            Object.fromEntries(
              [...capabilities].filter(
                ([, c]) => c.domain !== null || c.sortable,
              ),
            ),
          );
    return defs.map((def): FieldDef<unknown> => {
      // Native↔text codec round-trips the typed cell value through the generic
      // `TEXT` storage column; string types (text/enum) resolve IDENTITY_CODEC.
      const codec = resolveCodec(def.type);
      const { domain, sortable } = capabilities.get(def.id)!;
      const filterable = domain !== null;
      return {
        // The type's own projection of its opaque config onto GENERIC FieldDef
        // keys (enum's `config.options` → `options`), so downstream consumers
        // read one contract and never crack open `config` themselves. Spread
        // FIRST: a derivation contributes vocabulary, never identity/storage.
        ...deriveFromConfig(def.type, def.config),
        id: def.id,
        label: def.label,
        // NOT a literal — the field-type registry is the extension seam; the
        // type is dispatched through the generic cell/editor/filter slots.
        type: def.type,
        // While the values are still loading a cell reads as unset (the
        // codec's decode of `undefined`) — deliberately: abstaining (no
        // fields) would drop the columns and leave a view's filter rule on
        // one dangling, which `lowerFilterGroup` lowers to TRUE (every row).
        // Same choice, same reason, as the pages `starred` field. A failed
        // read keeps the last values seen; with none, `readError` below makes
        // every cell show the failure instead.
        value: (row) => {
          const index = foldResource(values, {
            loading: () => undefined,
            error: (_error, stale) => stale,
            ready: (data) => data,
          });
          return codec.decode(
            index?.get(rowKeyRef.current(row, 0))?.get(def.id),
          );
        },
        onEdit: (row, next) =>
          setValue({
            dataViewId: storageKey,
            rowKey: rowKeyRef.current(row, 0),
            columnId: def.id,
            value: codec.encode(next),
          }),
        // Opaque per-type config (e.g. enum options); understood only by the
        // field type's own code, passed through untouched.
        config: def.config,
        sortable,
        filterable,
        ...(scoped !== null && (filterable || sortable)
          ? { column: scoped.column(def.id) }
          : {}),
        ...(readError === undefined ? {} : { readError }),
      };
    });
  }, [
    defs,
    values,
    readError,
    setValue,
    storageKey,
    rowKeyRef,
    resolveCodec,
    resolveOps,
    deriveFromConfig,
    identities,
    liveColumnScope,
  ]);

  return <>{render(fields)}</>;
}
