import {
  setEditMode,
  useEditMode,
} from "@plugins/primitives/plugins/edit-mode-signal/web";
import { ControlPanel } from "@plugins/primitives/plugins/css/plugins/control-panel/web";
import { symbol } from "@plugins/ui/plugins/icons/core";
import { Icon } from "@plugins/ui/plugins/icons/web";

const editIcon = symbol("edit");

/**
 * The edit-mode switch, a row in the action bar's view-options popover. Esc
 * also leaves edit mode (the `reorder.exit-edit-mode` shortcut).
 */
export function EditLayoutSwitch() {
  const editMode = useEditMode();

  return (
    <ControlPanel.Row
      icon={<Icon icon={editIcon} />}
      select="switch"
      checked={editMode}
      onSelect={() => setEditMode(!editMode)}
    >
      Edit layout
    </ControlPanel.Row>
  );
}
