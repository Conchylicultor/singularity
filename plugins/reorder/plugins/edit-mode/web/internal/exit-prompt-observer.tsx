import { useEffect, useRef } from "react";
import { useEditMode } from "@plugins/reorder/web";
import { useHasStagedDefaults } from "@plugins/config_v2/plugins/staging/web";
import { setExitPromptOpen } from "./exit-prompt-store";

/**
 * Stable, top-level observer (mounted at `Core.Root`, so it never remounts when
 * edit mode toggles — unlike the pen button, which lives inside the re-rendered
 * action-bar slot). On the edit-mode `true → false` transition WHILE uncommitted
 * everyone-defaults are staged, it arms the exit Cancel/Commit popover via the
 * module-level flag the pen button reads.
 *
 * Observation, not interception: the load-bearing edit-mode store synchronously
 * resets scope to "personal" on exit, so this never reads scope — the trigger is
 * scope-independent ("edit mode just closed AND staged edits exist").
 */
export function ExitPromptObserver() {
  const editMode = useEditMode();
  const hasStaged = useHasStagedDefaults();
  const prev = useRef(editMode);
  useEffect(() => {
    if (prev.current && !editMode && hasStaged) setExitPromptOpen(true);
    prev.current = editMode;
  }, [editMode, hasStaged]);
  return null;
}
