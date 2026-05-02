import { useEditableField } from "@plugins/primitives/plugins/editable-field/web";
import { patchTask, useTask } from "@plugins/tasks/web";
import {
  useRegisterFlush,
  useTaskDetailFilePeek,
} from "@plugins/tasks/plugins/task-detail/web";
import { DescriptionView } from "./description-view";

export function TaskDescription({ taskId }: { taskId: string }) {
  const task = useTask(taskId);
  const { openFile } = useTaskDetailFilePeek();

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
