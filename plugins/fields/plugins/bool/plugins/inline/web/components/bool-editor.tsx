import type { ReactNode } from "react";
import { MdCheck, MdRemove } from "react-icons/md";
import type { CellEditorProps } from "@plugins/primitives/plugins/data-view/web";

/**
 * Compact inline boolean editor: an autofocused toggle button that immediately
 * commits the flipped value on click; Esc cancels. Mirrors BoolCell's visual.
 */
export function BoolEditor(props: CellEditorProps): ReactNode {
  return (
    <button
      type="button"
      autoFocus
      aria-label={props.value ? "Set to false" : "Set to true"}
      className="flex items-center"
      onClick={() => props.onCommit(!props.value)}
      onKeyDown={(e) => {
        if (e.key === "Escape") props.onCancel();
      }}
    >
      {props.value ? (
        <MdCheck className="text-foreground" />
      ) : (
        <MdRemove className="text-muted-foreground" />
      )}
    </button>
  );
}
