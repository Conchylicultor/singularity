import { MdEdit, MdDone } from "react-icons/md";
import { setEditMode, useEditMode } from "@plugins/reorder/web";
import { IconButton } from "@plugins/primitives/plugins/icon-button/web";
import { StatusDot } from "@plugins/primitives/plugins/css/plugins/status-dot/web";
import { Pin } from "@plugins/primitives/plugins/css/plugins/pin/web";
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
        // The dot overhangs the pen's top-right corner by a fixed 0.125rem —
        // off the density ramp, so the offset is an inline-style override.
        <Pin
          to="top-right"
          decorative
          style={{ top: "-0.125rem", right: "-0.125rem" }}
        >
          <StatusDot
            colorClass="bg-primary"
            className="ring-2 ring-background"
          />
        </Pin>
      )}
    </ExitCommitPopover>
  );
}
