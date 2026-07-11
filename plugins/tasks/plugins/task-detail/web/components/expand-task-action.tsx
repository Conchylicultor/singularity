import { useContext } from "react";
import { MdOpenInNew } from "react-icons/md";
import { PaneIconAction, useOpenPane } from "@plugins/primitives/plugins/pane/web";
import { taskDetailPane } from "../panes";
import { TasksPaneContext } from "../tasks-pane-context";

export function ExpandTaskAction() {
  const ctx = useContext(TasksPaneContext);
  const openPane = useOpenPane();
  // Only visible in tree mode — gated on the selection context being present.
  if (!ctx) return null;
  return (
    <PaneIconAction
      label="Open task"
      icon={MdOpenInNew}
      onClick={() =>
        openPane(taskDetailPane, { taskId: ctx.selectedId }, { mode: "push", options: { focused: true } })
      }
    />
  );
}
