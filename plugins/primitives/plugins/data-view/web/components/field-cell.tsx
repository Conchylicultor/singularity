import type { ReactNode } from "react";
import type {
  FieldDef,
  FieldValue,
  useResolveCell,
  useResolveCellEditor,
} from "../index";
import { EditableCell } from "./editable-cell";

/**
 * The single "render a field's value, editable when it declares `onEdit`"
 * component, used by every view. Read precedence is uniform: consumer
 * `field.cell` override → contributed `data-view.cell` slot (`resolveCell`) →
 * `String(value)`. When the field declares a write-back (`onEdit`/`onEditValues`)
 * the read is wrapped in `EditableCell` for click-to-edit; otherwise the read is
 * rendered bare.
 */
export interface FieldCellProps {
  field: FieldDef<unknown>;
  row: unknown;
  resolveCell: ReturnType<typeof useResolveCell>;
  resolveEditor: ReturnType<typeof useResolveCellEditor>;
  display?: "block" | "inline";
}

export function FieldCell({
  field,
  row,
  resolveCell,
  resolveEditor,
  display,
}: FieldCellProps): ReactNode {
  const value = field.value?.(row);
  const values = field.values?.(row);
  const read = field.cell
    ? field.cell(row)
    : (resolveCell(field, value, row, values) ?? String(value ?? ""));
  if (field.onEdit || field.onEditValues) {
    return (
      <EditableCell
        field={field}
        row={row}
        value={value}
        values={values}
        read={read}
        resolveEditor={resolveEditor}
        display={display}
        onEdit={
          field.onEdit as
            | ((row: unknown, next: FieldValue) => void | Promise<void>)
            | undefined
        }
        onEditValues={
          field.onEditValues as
            | ((row: unknown, next: string[]) => void | Promise<void>)
            | undefined
        }
      />
    );
  }
  return <>{read}</>;
}
