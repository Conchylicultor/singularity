import { useEffect, useState, type ReactNode } from "react";
import {
  useResolveCellEditor,
  type FieldDef,
} from "@plugins/primitives/plugins/data-view/web";
import type { TreeNode } from "@plugins/primitives/plugins/tree/core";
import {
  useTreeListContext,
  useTreeRow,
  type TreeItem,
} from "@plugins/primitives/plugins/tree/web";
import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";

/**
 * The tree's editable primary-field label. Reuses the shared
 * `useResolveCellEditor()` capability (the same per-type editors the table
 * uses) instead of the table's click-to-edit `EditableCell`, because the tree
 * label doubles as the navigation target: it must keep **select-then-edit**
 * (first interaction selects/navigates; a second click on the already-selected
 * row enters edit mode). New rows created via `onCreate` auto-open into edit via
 * the tree primitive's pending-focus → `shouldAutoFocus` signal.
 */
export function EditableTreeLabel<TNode extends TreeItem>(props: {
  node: TreeNode<TNode>;
  row: unknown;
  /** The primary field — guaranteed to have `onEdit`/`onEditValues` by the caller. */
  field: FieldDef<unknown>;
  /** The read-rendering of the primary value (caller passes resolveCell(...) ?? String). */
  read: ReactNode;
  className?: string;
}): ReactNode {
  const { node, row, field, read, className } = props;
  const resolveEditor = useResolveCellEditor();
  const { shouldAutoFocus, consumeAutoFocus } = useTreeRow(node);
  const ctx = useTreeListContext();
  const [editing, setEditing] = useState(false);

  // A freshly-created row auto-opens into edit mode; the slot editor autofocuses
  // its input on mount.
  useEffect(() => {
    if (shouldAutoFocus && !editing) {
      setEditing(true);
      consumeAutoFocus();
    }
  }, [shouldAutoFocus, editing, consumeAutoFocus]);

  if (editing) {
    const value = field.value?.(row);
    const values = field.values?.(row);
    const editor = resolveEditor({
      field,
      value,
      values,
      raw: row,
      onCommit: (next) => {
        setEditing(false);
        void field.onEdit?.(row, next);
      },
      onCommitValues: (next) => {
        setEditing(false);
        void field.onEditValues?.(row, next);
      },
      onCancel: () => setEditing(false),
    });
    // Only render the editor when a per-type editor exists; otherwise fall
    // through to the read label below.
    if (editor !== undefined) {
      return (
        <span
          className={cn("min-w-0 flex-1", className)}
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {editor}
        </span>
      );
    }
  }

  return (
    <span
      className={cn("min-w-0 flex-1 truncate", className)}
      onMouseDown={() => {
        // First interaction selects/navigates the row.
        if (ctx.selectedId !== node.id) ctx.onSelect(node.id);
      }}
      onClick={(e) => {
        // Clicking the label of an already-selected row enters edit mode.
        if (ctx.selectedId === node.id) {
          e.stopPropagation();
          setEditing(true);
        }
      }}
    >
      {read}
    </span>
  );
}
