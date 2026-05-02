import { useEditableField } from "@plugins/primitives/plugins/editable-field/web";
import { patchTask, useTask } from "@plugins/tasks/web";
import {
  useRegisterFlush,
  useTaskFileOpen,
} from "@plugins/tasks/plugins/task-detail/web";
import { taskFilePeekPane } from "@plugins/tasks/plugins/task-file-peek/web";
import { DescriptionView } from "./description-view";

export function TaskDescription({ taskId }: { taskId: string }) {
  const task = useTask(taskId);
  const override = useTaskFileOpen();
  const openFile = (path: string) => {
    if (override) override(path);
    else taskFilePeekPane.open({ taskId, filePath: path });
  };

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
