import { useContext } from "react";
import { MdArrowUpward } from "react-icons/md";
import { PaneIconAction } from "@plugins/primitives/plugins/pane/web";
import { useTask } from "@plugins/tasks/web";
import { TasksPaneContext } from "./tasks-pane-context";

export function GoToParentAction() {
  const ctx = useContext(TasksPaneContext);
  const viewRoot = useTask(ctx?.viewRootId);
  if (!ctx) return null;
  const folderId = viewRoot?.folderId ?? null;
  if (!folderId) return null;
  return (
    <PaneIconAction
      label="Go to folder task"
      icon={MdArrowUpward}
      onClick={() => {
        ctx.setViewRootId(folderId);
        ctx.setSelectedId(folderId);
      }}
    />
  );
}
