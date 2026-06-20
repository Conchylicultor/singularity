import { useState, type MouseEvent, type ReactNode } from "react";
import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Inline } from "@plugins/primitives/plugins/css/plugins/inline/web";
import type { FieldDef, FieldValue } from "../index";
import type { useResolveCellEditor } from "../index";

/**
 * A scalar FieldValue is "empty" when null/undefined or the empty string.
 * Numeric `0` and boolean `false` are real values, not empty.
 */
function isEmptyScalar(value: FieldValue): boolean {
  return value == null || value === "";
}

/**
 * Shared read affordance. In `"block"` mode it fills the cell (`w-full`) so the
 * WHOLE column width is a click target — not just the rendered glyphs; in
 * `"inline"` mode it flows inline inside text. Shows a muted "Empty" hint when
 * the value is empty, so nullable/blank cells stay discoverable and clickable
 * instead of collapsing to a zero-size, unclickable region.
 */
function ReadAffordance(props: {
  empty: boolean;
  read: ReactNode;
  display: "block" | "inline";
  onClick: (e: MouseEvent) => void;
}): ReactNode {
  return (
    <Text
      as={props.display === "inline" ? "span" : "div"}
      className={cn("cursor-text", props.display === "inline" ? undefined : "w-full")}
      onClick={props.onClick}
    >
      {props.empty ? (
        <span className="italic text-muted-foreground/50">Empty</span>
      ) : (
        props.read
      )}
    </Text>
  );
}

/**
 * Presentational click-to-edit wrapper for one field cell. Holds ONLY an
 * `editing` boolean — the parent owns `resolveEditor` (hooks must run
 * unconditionally at the view top level) and the write-back. A field is
 * scalar (`value` + `onEdit`) or multi-value (`values` + `onEditValues`); the
 * empty-check and the commit channel follow whichever the field declares.
 * `stopPropagation` keeps a cell edit from triggering row activation.
 *
 * `autoEdit` starts the cell in edit mode on mount (the contributed slot editors
 * `autoFocus`, so mounting the editor focuses it) — used by the tree's
 * auto-focus-on-create. `display` controls layout of both the read affordance
 * and the editor wrapper: `"block"` (default) fills the cell; `"inline"` flows
 * inline inside text.
 */
export function EditableCell(props: {
  field: FieldDef<unknown>;
  row: unknown;
  value: FieldValue;
  values?: readonly string[];
  read: ReactNode;
  resolveEditor: ReturnType<typeof useResolveCellEditor>;
  autoEdit?: boolean;
  display?: "block" | "inline";
  onEdit?: (row: unknown, next: FieldValue) => void | Promise<void>;
  onEditValues?: (row: unknown, next: string[]) => void | Promise<void>;
}): ReactNode {
  const [editing, setEditing] = useState(props.autoEdit ?? false);
  const display = props.display ?? "block";
  const isMulti = props.field.values != null;
  const empty = isMulti
    ? !(props.values && props.values.length > 0)
    : isEmptyScalar(props.value);

  if (editing) {
    const editor = props.resolveEditor({
      field: props.field,
      value: props.value,
      values: props.values,
      raw: props.row,
      onCommit: (next) => {
        setEditing(false);
        void props.onEdit?.(props.row, next);
      },
      onCommitValues: (next) => {
        setEditing(false);
        void props.onEditValues?.(props.row, next);
      },
      onCancel: () => setEditing(false),
    });
    if (editor) {
      // `min-w-0` is dropped: a block wrapper's min-width is already 0, and the
      // inline `<Inline>` constrains itself — the cell track (min-w-0) is what
      // lets the editor shrink.
      return display === "inline" ? (
        <Inline gap="none" as="span" onClick={(e) => e.stopPropagation()}>
          {editor}
        </Inline>
      ) : (
        <div className="w-full" onClick={(e) => e.stopPropagation()}>
          {editor}
        </div>
      );
    }
    // No contributed editor for this type → never trap the user.
    return (
      <ReadAffordance
        empty={empty}
        read={props.read}
        display={display}
        onClick={(e) => e.stopPropagation()}
      />
    );
  }
  return (
    <ReadAffordance
      empty={empty}
      read={props.read}
      display={display}
      onClick={(e) => {
        e.stopPropagation();
        setEditing(true);
      }}
    />
  );
}
