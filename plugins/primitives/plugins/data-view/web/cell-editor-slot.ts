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
import type { CellEditorProps, FieldDef, FieldValue } from "../core";
import { useFieldIdentities } from "./internal/use-field-identities";

/**
 * Per-type inline cell editor slot. Contributors call `DataViewSlots.CellEditor({ match, component })`.
 * Resolution is custom (`useResolveCellEditor`) so it can walk the `extends` chain —
 * `defineDispatchSlot`'s built-in `.Dispatch` can't.
 */
const CellEditor = defineDispatchSlot<CellEditorProps>("data-view.cell-editor", {
  key: (p) => p.field.type ?? "text",
  docLabel: (c) => (typeof c.match === "string" ? c.match : undefined),
});

/** Returns a renderer that resolves a field's type editor honoring `extends`, or undefined. */
export function useResolveCellEditor(): (
  field: FieldDef<unknown>,
  value: FieldValue,
  raw: unknown,
  onCommit: (next: FieldValue) => void,
  onCancel: () => void,
) => ReactNode | undefined {
  const ctx = useContext(PluginRuntimeContext);
  const identities = useFieldIdentities();
  const raw0 = ctx?.bySlot.get("data-view.cell-editor");
  return useCallback(
    (field, value, row, onCommit, onCancel) => {
      const chain = resolveTypeChain(field.type ?? "text", identities);
      for (const typeId of chain) {
        const contribution = (raw0 ?? []).find(
          (c) => (c as { match?: unknown }).match === typeId,
        ) as Contribution | undefined;
        if (contribution) {
          return renderIsolated("data-view.cell-editor", contribution, {
            value,
            field,
            raw: row,
            onCommit,
            onCancel,
          } satisfies CellEditorProps);
        }
      }
      return undefined;
    },
    [raw0, identities],
  );
}

export { CellEditor };
