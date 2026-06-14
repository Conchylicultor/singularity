import { MdOpenInFull } from "react-icons/md";
import { PaneIconAction, useOpenPane } from "@plugins/primitives/plugins/pane/web";
import { taskDetailPane } from "@plugins/tasks/plugins/task-detail/web";
import { taskSidePane } from "../panes";

export function ExpandTaskButton() {
  const { taskId } = taskSidePane.useParams();
  const openPane = useOpenPane();
  return (
    <PaneIconAction
      label="Expand"
      icon={MdOpenInFull}
      onClick={() => openPane(taskDetailPane, { taskId }, { mode: "root" })}
    />
  );
}
