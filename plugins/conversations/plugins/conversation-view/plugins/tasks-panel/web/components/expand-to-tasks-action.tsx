import { useContext } from "react";
import { MdOpenInNew } from "react-icons/md";
import { PaneIconAction } from "@plugins/primitives/plugins/pane/web";
import { taskDetailPane } from "@plugins/tasks/web";
import { TasksPaneContext } from "./tasks-pane-context";

export function ExpandToTasksAction() {
  const ctx = useContext(TasksPaneContext);
  if (!ctx) return null;
  return (
    <PaneIconAction
      label="Open in Tasks"
      icon={MdOpenInNew}
      onClick={() => taskDetailPane.open({ taskId: ctx.selectedId })}
    />
  );
}
