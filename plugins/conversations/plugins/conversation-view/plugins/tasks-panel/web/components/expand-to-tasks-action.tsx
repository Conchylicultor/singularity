import { useContext } from "react";
import { MdOpenInNew } from "react-icons/md";
import { PaneIconAction, useOpenPane } from "@plugins/primitives/plugins/pane/web";
import { taskDetailPane } from "@plugins/tasks/plugins/task-detail/web";
import { TasksPaneContext } from "./tasks-pane-context";

export function ExpandToTasksAction() {
  const ctx = useContext(TasksPaneContext);
  const openPane = useOpenPane();
  if (!ctx) return null;
  return (
    <PaneIconAction
      label="Open in Tasks"
      icon={MdOpenInNew}
      onClick={() => openPane(taskDetailPane, { taskId: ctx.selectedId }, { mode: "push" })}
    />
  );
}
