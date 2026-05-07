import { MdEdit, MdDone } from "react-icons/md";
import { setEditMode, useEditMode } from "@plugins/reorder/web";
import { IconButton } from "@plugins/primitives/plugins/icon-button/web";

export function PenButton() {
  const editMode = useEditMode();
  const label = editMode ? "Exit edit mode" : "Reorder items";
  return (
    <IconButton
      icon={editMode ? MdDone : MdEdit}
      label={label}
      variant={editMode ? "secondary" : "ghost"}
      aria-pressed={editMode}
      onClick={() => setEditMode(!editMode)}
    />
  );
}
