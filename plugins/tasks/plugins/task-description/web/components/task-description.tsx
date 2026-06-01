import { useCallback } from "react";
import { useEditableField } from "@plugins/primitives/plugins/editable-field/web";
import { fetchEndpoint } from "@plugins/infra/plugins/endpoints/web";
import { LaunchControl } from "@plugins/primitives/plugins/launch/web";
import { useOpenPane } from "@plugins/primitives/plugins/pane/web";
import { patchTask, useTask } from "@plugins/tasks/web";
import { getTask as getTaskEndpoint } from "@plugins/tasks/core";
import { buildTaskPrompt } from "@plugins/tasks-core/core";
import { useFlushAll, useRegisterFlush } from "@plugins/tasks/plugins/task-detail/web";
import { filePeekPane } from "@plugins/conversations/plugins/conversation-view/plugins/code/plugins/file-pane/web";
import { DescriptionView } from "./description-view";

export function TaskDescription({ taskId }: { taskId: string }) {
  const task = useTask(taskId);
  const flushAll = useFlushAll();
  const openPane = useOpenPane();
  const openFile = (path: string) =>
    openPane(filePeekPane, { worktree: "main", filePath: path }, { mode: "push" });

  const descField = useEditableField({
    value: task?.description ?? "",
    onSave: (v) => patchTask(taskId, { description: v }),
  });
  useRegisterFlush(descField.flush);

  const buildLaunchRequest = useCallback(async () => {
    await flushAll();
    const fresh = await fetchEndpoint(getTaskEndpoint, { id: taskId }).catch(() => null);
    return { taskId, prompt: buildTaskPrompt(fresh ?? task ?? {}) };
  }, [taskId, task, flushAll]);

  if (!task) return null;

  return (
    <div className="flex flex-col gap-3">
      <DescriptionView
        value={descField.value}
        onChange={descField.onChange}
        onFocus={descField.onFocus}
        onBlur={descField.onBlur}
        onFileOpen={openFile}
      />
      <div className="flex justify-end">
        <LaunchControl
          size="sm"
          getRequest={buildLaunchRequest}
          disabled={!task.title.trim()}
          className="w-auto"
          openAfterLaunch={false}
        />
      </div>
    </div>
  );
}
