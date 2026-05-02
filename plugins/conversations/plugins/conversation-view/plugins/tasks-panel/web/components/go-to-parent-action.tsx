import { useContext } from "react";
import { MdArrowUpward } from "react-icons/md";
import { PaneIconAction } from "@plugins/primitives/plugins/pane/web";
import { useTask } from "@plugins/tasks/web";
import { TasksPaneContext } from "./tasks-pane-context";

export function GoToParentAction() {
  const ctx = useContext(TasksPaneContext);
  const viewRoot = useTask(ctx?.viewRootId);
  if (!ctx) return null;
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
