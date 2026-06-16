import { useCallback, useContext, type ReactNode } from "react";
import {
  PluginRuntimeContext,
  type Contribution,
} from "@plugins/framework/plugins/web-sdk/core";
import {
  defineDispatchSlot,
  renderIsolated,
} from "@plugins/primitives/plugins/slot-render/web";
import { resolveTypeChain } from "@plugins/fields/core";
import type { FieldDef, FieldValue, TableCellProps } from "../core";
import { useFieldIdentities } from "./internal/use-field-identities";

/**
 * Per-type table cell slot. Contributors call `DataViewSlots.Cell({ match, component })`.
 * Resolution is custom (`useResolveCell`) so it can walk the `extends` chain —
 * `defineDispatchSlot`'s built-in `.Dispatch` can't.
 */
const Cell = defineDispatchSlot<TableCellProps>("data-view.cell", {
  key: (p) => p.field.type ?? "text",
  docLabel: (c) => (typeof c.match === "string" ? c.match : undefined),
});

/** Returns a renderer that resolves a field's type cell honoring `extends`, or undefined. */
export function useResolveCell(): (
  field: FieldDef<unknown>,
  value: FieldValue,
  raw: unknown,
  values?: readonly string[],
) => ReactNode | undefined {
  const ctx = useContext(PluginRuntimeContext);
  const identities = useFieldIdentities();
  const raw0 = ctx?.bySlot.get("data-view.cell");
  return useCallback(
    (field, value, row, values) => {
      const chain = resolveTypeChain(field.type ?? "text", identities);
      for (const typeId of chain) {
        const contribution = (raw0 ?? []).find(
          (c) => (c as { match?: unknown }).match === typeId,
        ) as Contribution | undefined;
        if (contribution) {
          return renderIsolated("data-view.cell", contribution, {
            value,
            values,
            field,
            raw: row,
          } satisfies TableCellProps);
        }
      }
      return undefined;
    },
    [raw0, identities],
  );
}

export { Cell };
