import { useState, type ReactNode } from "react";
import type { FieldDef, FieldValue } from "@plugins/primitives/plugins/data-view/web";
import type { useResolveCellEditor } from "@plugins/primitives/plugins/data-view/web";

/**
 * Presentational click-to-edit wrapper for one table cell. Holds ONLY an
 * `editing` boolean — the parent owns `resolveEditor` (hooks must run
 * unconditionally at the table-view top level) and the `onEdit` write-back.
 * `stopPropagation` keeps a cell edit from triggering row activation.
 */
export function EditableCell(props: {
  field: FieldDef<unknown>;
  row: unknown;
  value: FieldValue;
  read: ReactNode;
  resolveEditor: ReturnType<typeof useResolveCellEditor>;
  onEdit: (row: unknown, next: FieldValue) => void | Promise<void>;
}): ReactNode {
  const [editing, setEditing] = useState(false);
  if (editing) {
    const editor = props.resolveEditor(
      props.field,
      props.value,
      props.row,
      (next) => {
        setEditing(false);
        void props.onEdit(props.row, next);
      },
      () => setEditing(false),
    );
    if (editor)
      return (
        <div className="min-w-0" onClick={(e) => e.stopPropagation()}>
          {editor}
        </div>
      );
    // No contributed editor for this type → never trap the user.
    return (
      <div
        className="min-w-0 cursor-text truncate"
        onClick={(e) => {
          e.stopPropagation();
        }}
      >
        {props.read}
      </div>
    );
  }
  return (
    <div
      className="min-w-0 cursor-text truncate"
      onClick={(e) => {
        e.stopPropagation();
        setEditing(true);
      }}
    >
      {props.read}
    </div>
  );
}
