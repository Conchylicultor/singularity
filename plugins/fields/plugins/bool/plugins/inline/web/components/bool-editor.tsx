import type { ReactNode } from "react";
import { Center } from "@plugins/primitives/plugins/css/plugins/center/web";
import type { CellEditorProps } from "@plugins/primitives/plugins/data-view/web";
import { symbol } from "@plugins/ui/plugins/icons/core";
import { Icon } from "@plugins/ui/plugins/icons/web";

const checkIcon = symbol("check");
const removeIcon = symbol("remove");

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
      onClick={() => props.onCommit(!props.value)}
      onKeyDown={(e) => {
        if (e.key === "Escape") props.onCancel();
      }}
    >
      <Center axis="vertical">
        {props.value ? (
          <Icon icon={checkIcon} className="text-foreground" />
        ) : (
          <Icon icon={removeIcon} className="text-muted-foreground" />
        )}
      </Center>
    </button>
  );
}
