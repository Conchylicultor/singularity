import { useCallback } from "react";
import { useEditableField } from "@plugins/primitives/plugins/editable-field/web";
import { useResource, ResourceView } from "@plugins/primitives/plugins/live-state/web";
import {
  Collapsible,
  CollapsibleContent,
} from "@plugins/primitives/plugins/collapsible/web";
import { SectionHeaderRow } from "@plugins/primitives/plugins/css/plugins/row/web";
import { fetchEndpoint } from "@plugins/infra/plugins/endpoints/web";
import { LaunchControl } from "@plugins/primitives/plugins/launch/web";
import { useIsContainerTask } from "@plugins/tasks/plugins/container-tasks/web";
import { patchTask, useTask } from "@plugins/tasks/web";
import { getTask as getTaskEndpoint, taskDetailResource } from "@plugins/tasks/core";
import type { Task } from "@plugins/tasks/core";
import { buildTaskPrompt } from "@plugins/tasks/plugins/tasks-core/core";
import { useFlushAll, useRegisterFlush } from "@plugins/tasks/plugins/task-detail/web";
import { DescriptionView } from "./description-view";

function TaskDescriptionInner({
  taskId,
  task,
  detailTask,
}: {
  taskId: string;
  task: NonNullable<ReturnType<typeof useTask>>;
  detailTask: Task | null;
}) {
  const flushAll = useFlushAll();
  const isContainer = useIsContainerTask(taskId);

  const descField = useEditableField({
    value: detailTask?.description ?? "",
    onSave: (v) => patchTask(taskId, { description: v }),
  });
  useRegisterFlush(descField.flush);

  const buildLaunchRequest = useCallback(async () => {
    await flushAll();
    const fresh = await fetchEndpoint(getTaskEndpoint, { id: taskId }).catch(() => null);
    return { taskId, prompt: buildTaskPrompt(fresh ?? detailTask ?? {}) };
  }, [taskId, detailTask, flushAll]);

  return (
    <Collapsible defaultOpen className="flex flex-col gap-md">
      <SectionHeaderRow variant="eyebrow">Description</SectionHeaderRow>
      <CollapsibleContent className="flex flex-col gap-md">
        <DescriptionView
          value={descField.value}
          onChange={descField.onChange}
          onFocus={descField.onFocus}
          onBlur={descField.onBlur}
        />
        {/* A container/meta task is a system folder that can't own an attempt —
            hide Launch so the user never hits the server-side rejection. */}
        {!isContainer && (
          <div className="flex justify-end">
            <LaunchControl
              size="sm"
              getRequest={buildLaunchRequest}
              disabled={!task.title.trim()}
              className="w-auto"
              openAfterLaunch={false}
            />
          </div>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}

export function TaskDescription({ taskId }: { taskId: string }) {
  const task = useTask(taskId);
  // `description` is not in the lean list payload — read the full task (incl.
  // description) from the per-id detail resource, which stays live across tabs.
  const detail = useResource(taskDetailResource, { id: taskId });

  if (!task) return null;

  // Wait for the detail payload before showing the editor: seeding useEditableField
  // from a not-yet-loaded "" and letting the user type would race the real value in.
  return (
    <ResourceView resource={detail}>
      {(detailTask) => (
        <TaskDescriptionInner taskId={taskId} task={task} detailTask={detailTask} />
      )}
    </ResourceView>
  );
}
