import { useContext } from "react";
import { MdArrowUpward } from "react-icons/md";
import { PaneIconAction } from "@plugins/primitives/plugins/pane/web";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { tasksResource } from "@plugins/tasks/shared";
import { TasksPaneContext } from "./tasks-pane-context";

export function GoToParentAction() {
  const ctx = useContext(TasksPaneContext);
  const { data: tasks } = useResource(tasksResource);
  if (!ctx) return null;
  const viewRoot = tasks?.find((t) => t.id === ctx.viewRootId);
  const parentId = viewRoot?.parentId ?? null;
  if (!parentId) return null;
  return (
    <PaneIconAction
      label="Go to parent task"
      icon={MdArrowUpward}
      onClick={() => {
        ctx.setViewRootId(parentId);
        ctx.setSelectedId(parentId);
      }}
    />
  );
}
