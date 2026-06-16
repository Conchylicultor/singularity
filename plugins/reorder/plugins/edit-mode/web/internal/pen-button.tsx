import { MdEdit, MdDone } from "react-icons/md";
import { setEditMode, useEditMode } from "@plugins/reorder/web";
import { IconButton } from "@plugins/primitives/plugins/icon-button/web";
import { StatusDot } from "@plugins/primitives/plugins/status-dot/web";
import { useHasStagedDefaults } from "@plugins/config_v2/plugins/staging/web";
import { ExitCommitPopover } from "./exit-commit-popover";

export function PenButton() {
  const editMode = useEditMode();
  const hasStaged = useHasStagedDefaults();
  const label = editMode ? "Exit edit mode" : "Reorder items";

  // A status dot overlays the pen's top-right corner whenever uncommitted
  // everyone-defaults are staged (visible in and out of edit mode so the
  // uncommitted state is always discoverable). ExitCommitPopover wraps the
  // button and anchors the exit Cancel/Commit popover to it.
  return (
    <ExitCommitPopover>
      <IconButton
        icon={editMode ? MdDone : MdEdit}
        label={label}
        variant={editMode ? "secondary" : "ghost"}
        aria-pressed={editMode}
        onClick={() => setEditMode(!editMode)}
      />
      {hasStaged && (
        <StatusDot
          colorClass="bg-primary"
          size="sm"
          className="pointer-events-none absolute -top-0.5 -right-0.5 ring-2 ring-background"
        />
      )}
    </ExitCommitPopover>
  );
}
