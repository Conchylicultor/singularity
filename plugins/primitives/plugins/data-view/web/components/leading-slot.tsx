import type { ReactNode } from "react";
import type { FieldDef } from "../../core";
import type { useResolveCell } from "../cell-slot";
import type { useResolveCellEditor } from "../cell-editor-slot";
import { FieldCell } from "./field-cell";

export interface LeadingSlotProps {
  /** The schema's leading field (`pickLeadingField` over the view's visible
   *  set), or `undefined` when the schema declares none / it is hidden. */
  field: FieldDef<unknown> | undefined;
  row: unknown;
  resolveCell: ReturnType<typeof useResolveCell>;
  resolveEditor: ReturnType<typeof useResolveCellEditor>;
  /** The view's own per-view leading node (list/gallery `leading`, tree
   *  `leadingIcon`), rendered AFTER the leading field. */
  own: ReactNode;
}

/**
 * The row's leading slot content, shared by every view that has one (list,
 * gallery, tree) so the order and composition cannot drift between them: the
 * leading field's cell FIRST, then the view's own leading node.
 *
 * A function, not a component, because presence is part of its answer: with
 * neither a field nor an own node it returns `undefined`, so a host slot
 * (`Row.icon`, `RowChrome.icon`, `DataCard.leading`) sees "no icon" exactly as
 * it did before — an element, even one rendering nothing, would read as present.
 */
export function leadingSlot({
  field,
  row,
  resolveCell,
  resolveEditor,
  own,
}: LeadingSlotProps): ReactNode | undefined {
  if (!field) return own ?? undefined;
  return (
    <>
      <FieldCell
        field={field}
        row={row}
        resolveCell={resolveCell}
        resolveEditor={resolveEditor}
      />
      {own}
    </>
  );
}
