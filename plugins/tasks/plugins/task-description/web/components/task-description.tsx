import { useEditableField } from "@plugins/primitives/plugins/editable-field/web";
import { useOpenPane } from "@plugins/primitives/plugins/pane/web";
import { patchTask, useTask } from "@plugins/tasks/web";
import { useRegisterFlush } from "@plugins/tasks/plugins/task-detail/web";
import { filePeekPane } from "@plugins/conversations/plugins/conversation-view/plugins/code/plugins/file-pane/web";
import { DescriptionView } from "./description-view";

export function TaskDescription({ taskId }: { taskId: string }) {
  const task = useTask(taskId);
  const openPane = useOpenPane();
  const openFile = (path: string) =>
    openPane(filePeekPane, { worktree: "main", filePath: path }, { mode: "push" });

  const descField = useEditableField({
    value: task?.description ?? "",
    onSave: (v) => patchTask(taskId, { description: v }),
  });
  useRegisterFlush(descField.flush);

  if (!task) return null;

  return (
    <DescriptionView
      value={descField.value}
      onChange={descField.onChange}
      onFocus={descField.onFocus}
      onBlur={descField.onBlur}
      onFileOpen={openFile}
    />
  );
}
