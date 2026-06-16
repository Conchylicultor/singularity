import { useState, type MouseEvent, type ReactNode } from "react";
import type { FieldDef, FieldValue } from "@plugins/primitives/plugins/data-view/web";
import type { useResolveCellEditor } from "@plugins/primitives/plugins/data-view/web";

/**
 * A FieldValue is "empty" (→ shows the muted hint) when it is null/undefined or
 * the empty string. Numeric `0` and boolean `false` are real values, not empty.
 */
function isEmptyValue(value: FieldValue): boolean {
  return value == null || value === "";
}

/**
 * Shared read affordance. Fills the grid cell (`w-full`) so the WHOLE column
 * width is a click target — not just the rendered glyphs — and shows a muted
 * "Empty" hint when the value is empty, so nullable/blank cells stay
 * discoverable and clickable instead of collapsing to a zero-size, unclickable
 * region.
 */
function ReadAffordance(props: {
  value: FieldValue;
  read: ReactNode;
  onClick: (e: MouseEvent) => void;
}): ReactNode {
  return (
    <div className="w-full min-w-0 cursor-text truncate" onClick={props.onClick}>
      {isEmptyValue(props.value) ? (
        <span className="italic text-muted-foreground/50">Empty</span>
      ) : (
        props.read
      )}
    </div>
  );
}

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
        <div className="w-full min-w-0" onClick={(e) => e.stopPropagation()}>
          {editor}
        </div>
      );
    // No contributed editor for this type → never trap the user.
    return (
      <ReadAffordance
        value={props.value}
        read={props.read}
        onClick={(e) => e.stopPropagation()}
      />
    );
  }
  return (
    <ReadAffordance
      value={props.value}
      read={props.read}
      onClick={(e) => {
        e.stopPropagation();
        setEditing(true);
      }}
    />
  );
}
