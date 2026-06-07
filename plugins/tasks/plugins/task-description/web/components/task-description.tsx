import { useCallback } from "react";
import { useEditableField } from "@plugins/primitives/plugins/editable-field/web";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import {
  Collapsible,
  CollapsibleContent,
} from "@plugins/primitives/plugins/collapsible/web";
import { SectionHeaderRow } from "@plugins/primitives/plugins/row/web";
import { fetchEndpoint } from "@plugins/infra/plugins/endpoints/web";
import { LaunchControl } from "@plugins/primitives/plugins/launch/web";
import { useOpenPane } from "@plugins/primitives/plugins/pane/web";
import { patchTask, useTask } from "@plugins/tasks/web";
import { getTask as getTaskEndpoint, taskDetailResource } from "@plugins/tasks/core";
import { buildTaskPrompt } from "@plugins/tasks-core/core";
import { useFlushAll, useRegisterFlush } from "@plugins/tasks/plugins/task-detail/web";
import { filePeekPane } from "@plugins/conversations/plugins/conversation-view/plugins/code/plugins/file-pane/web";
import { DescriptionView } from "./description-view";

export function TaskDescription({ taskId }: { taskId: string }) {
  const task = useTask(taskId);
  // `description` is not in the lean list payload — read the full task (incl.
  // description) from the per-id detail resource, which stays live across tabs.
  const detail = useResource(taskDetailResource, { id: taskId });
  const detailTask = detail.pending ? null : detail.data;
  const flushAll = useFlushAll();
  const openPane = useOpenPane();
  const openFile = (path: string) =>
    openPane(filePeekPane, { worktree: "main", filePath: path }, { mode: "push" });

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

  // Wait for the detail payload before showing the editor: seeding it from a
  // not-yet-loaded "" and letting the user type would race the real value in.
  if (!task || detail.pending) return null;

  return (
    <Collapsible defaultOpen className="flex flex-col gap-3">
      <SectionHeaderRow variant="eyebrow">Description</SectionHeaderRow>
      <CollapsibleContent className="flex flex-col gap-3">
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
      </CollapsibleContent>
    </Collapsible>
  );
}
