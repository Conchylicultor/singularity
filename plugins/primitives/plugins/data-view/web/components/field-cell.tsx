import type { ReactNode } from "react";
import type {
  FieldDef,
  FieldValue,
  useResolveCell,
  useResolveCellEditor,
} from "../index";
import { EditableCell } from "./editable-cell";

/**
 * Thrown by `FieldCell` when a field declares `data` but neither a `cell`
 * override nor a contributed type cell can draw it — a crash the enclosing
 * view's error boundary surfaces, instead of a silently blank cell.
 */
export class MissingDataCellError extends Error {
  constructor(field: FieldDef<unknown>) {
    super(
      `data-view: field "${field.id}" declares \`data\` but no cell is registered for its type "${field.type ?? "text"}" — nothing can draw it`,
    );
    this.name = "MissingDataCellError";
  }
}

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
    : (resolveCell(field, value, row, values) ?? readFallback(field, value));
  if (field.onEdit != null || field.onEditValues != null) {
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
            ((row: unknown, next: string[]) => void | Promise<void>) | undefined
        }
      />
    );
  }
  return <>{read}</>;
}

/** The `String(value)` fallback — refused for a `data` field, whose projection
 *  only a type cell can draw: an empty string there would hide the missing cell
 *  (e.g. the type's cell plugin is absent from the composition). Exported for
 *  the one read path that does not go through `FieldCell` (the tree's primary
 *  label), so both reads refuse the same way. */
export function readFallback(
  field: FieldDef<unknown>,
  value: FieldValue,
): string {
  if (field.data != null) throw new MissingDataCellError(field);
  return String(value ?? "");
}
