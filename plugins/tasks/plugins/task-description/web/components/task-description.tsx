import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { useEditableField } from "@plugins/primitives/plugins/editable-field/web";
import { tasksResource } from "@plugins/tasks/shared";
import {
  useRegisterFlush,
  useTaskDetailFilePeek,
} from "@plugins/tasks/plugins/task-detail/web";
import { DescriptionView } from "./description-view";

async function patchDescription(
  taskId: string,
  description: string | null,
): Promise<void> {
  await fetch(`/api/tasks/${taskId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ description }),
  });
}

export function TaskDescription({ taskId }: { taskId: string }) {
  const { data } = useResource(tasksResource);
  const task = data?.find((t) => t.id === taskId) ?? null;
  const { openFile } = useTaskDetailFilePeek();

  const descField = useEditableField({
    value: task?.description ?? "",
    onSave: (v) => patchDescription(taskId, v),
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
